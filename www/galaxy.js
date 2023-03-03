var exec = require('cordova/exec');
var argscheck = require('cordova/argscheck');
var callbackMap = {};

var token;
var inAppBrowserRef;

(function (global) {
  cordova.plugin.http.setDataSerializer('json');

  var Galaxy = function () { };

  if (!Galaxy.settings) {
    Galaxy.settings = {
      GlobalHeaderInjection: null,
    };
  }

  if (!Galaxy._internalSettings) {
    Galaxy._internalSettings = {
      publishableKey: null,
      tokenStorageKey: "savedToken",
      productionAppUrl: "https://app.galaxy.us",
      productionServerUrl: "https://api.galaxysdk.com/api/v1",
      sdkVersion: "1.0.2",
      requestGetParams: {
        sdk: "JavaScriptSDK-1.0.2"
      },
      sessionTicket: null,
      verticalName: null, // The name of a customer vertical. This is only for customers running a private cluster. Generally you shouldn't touch this
      errorTitleId: "Must be have Galaxy.settings.titleId set to call this method",
      errorLoggedIn: "Must be logged in to call this method",
      errorEntityToken: "You must successfully call GetEntityToken before calling this",
      errorSecretKey: "Must have Galaxy.settings.developerSecretKey set to call this method",

      GetServerUrl: function () {
        if (!(Galaxy._internalSettings.productionServerUrl.substring(0, 4) === "http")) {
          if (Galaxy._internalSettings.verticalName) {
            return "https://" + Galaxy._internalSettings.verticalName + Galaxy._internalSettings.productionServerUrl;
          } else {
            return "https://" + Galaxy.settings.titleId + Galaxy._internalSettings.productionServerUrl;
          }
        } else {
          return Galaxy._internalSettings.productionServerUrl;
        }
      },

      InjectHeaders: function (xhr, headersObj) {
        if (!headersObj)
          return;

        for (var headerKey in headersObj) {
          try {
            xhr.setRequestHeader(gHeaderKey, headersObj[headerKey]);
          } catch (e) {
            console.log("Failed to append header: " + headerKey + " = " + headersObj[headerKey] + "Error: " + e);
          }
        }
      },

      GetAuthorization: function () {
        try {
          if (!token) {
            return null;
          }

          var userInfo = getUserInfo();
          if (!userInfo.anonymous) {
            return ['Super-Authorization', token];
          }

          return ['Anonymous-Authorization', token];
        } catch (_) {
          return ['Anonymous-Authorization', token];
        }
      },

      ExecuteRequest: function (url, request, authkey, authValue, method, callback, customData, extraHeaders) {
        var resultPromise = new Promise(function (resolve, reject) {
          if (callback != null && typeof (callback) !== "function")
            throw "Callback must be null or a function";

          if (request == null)
            request = {};

          var startTime = new Date();
          var requestBody = JSON.stringify(request);

          var urlArr = [url];
          var getParams = Galaxy._internalSettings.requestGetParams;
          if (getParams != null) {
            var firstParam = true;
            for (var key in getParams) {
              if (firstParam) {
                urlArr.push("?");
                firstParam = false;
              } else {
                urlArr.push("&");
              }
              urlArr.push(key);
              urlArr.push("=");
              urlArr.push(getParams[key]);
            }
          }

          var completeUrl = urlArr.join("");

          var xhr = new XMLHttpRequest();
          xhr.open(method, completeUrl, true);

          xhr.setRequestHeader("Content-Type", "application/json");
          xhr.setRequestHeader("Publishable-Key", Galaxy._internalSettings.publishableKey);
          xhr.setRequestHeader("X-GalaxySDK", "JavaScriptSDK-" + Galaxy._internalSettings.sdkVersion);
          if (authkey != null)
            xhr.setRequestHeader(authkey, authValue);
          var auth = Galaxy._internalSettings.GetAuthorization();
          if (auth != null)
            xhr.setRequestHeader(auth[0], auth[1]);
          Galaxy._internalSettings.InjectHeaders(xhr, Galaxy.settings.GlobalHeaderInjection);
          Galaxy._internalSettings.InjectHeaders(xhr, extraHeaders);

          xhr.onloadend = function () {
            if (callback == null)
              return;

            var result = Galaxy._internalSettings.GetGalaxyResponse(request, xhr, startTime, customData);
            if ((result.code === 200) || (result.code === 201) || (result.code === 202) || (result.code === 204)) {
              callback(result, null);
            } else {
              if (url.indexOf("signup/anonymous") !== -1) {
                callback(result, null);
              } else {
                callback(null, result);
              }
            }
          }

          xhr.onerror = function () {
            if (callback == null)
              return;

            var result = Galaxy._internalSettings.GetGalaxyResponse(request, xhr, startTime, customData);
            callback(null, result);
          }

          if (method !== "GET")
            xhr.send(requestBody);
          xhr.onreadystatechange = function () {
            if (this.readyState === 4) {
              var xhrResult = Galaxy._internalSettings.GetGalaxyResponse(request, this, startTime, customData);
              if ((this.status === 200) || (this.status === 201) || (this.status === 202) || (this.status === 204)) {
                resolve(xhrResult);
              } else {
                reject(xhrResult);
              }
            }
          };
        });
        // Return a Promise so that calls to various API methods can be handled asynchronously
        return resultPromise;
      },

      GetGalaxyResponse: function (request, xhr, startTime, customData) {
        var result = null;
        try {
          // window.console.log("parsing json result: " + xhr.responseText);
          result = JSON.parse(xhr.responseText);
        } catch (e) {
          result = {
            code: 503, // Service Unavailable
            status: "Service Unavailable",
            error: "Connection error",
            errorCode: 2, // GalaxyErrorCode.ConnectionError
            errorMessage: xhr.responseText
          };
        }

        result.CallBackTimeMS = new Date() - startTime;
        result.Request = request;
        result.CustomData = customData;
        return result;
      },

      authenticationContext: {
        GalaxyId: null,
        EntityId: null,
        EntityType: null,
        SessionTicket: null,
        EntityToken: null
      },

      UpdateAuthenticationContext: function (authenticationContext, result) {
        var authenticationContextUpdates = {};
        if (result.data.GalaxyId !== null) {
          Galaxy._internalSettings.authenticationContext.GalaxyId = result.data.GalaxyId;
          authenticationContextUpdates.GalaxyId = result.data.GalaxyId;
        }
        if (result.data.SessionTicket !== null) {
          Galaxy._internalSettings.authenticationContext.SessionTicket = result.data.SessionTicket;
          authenticationContextUpdates.SessionTicket = result.data.SessionTicket;
        }
        if (result.data.EntityToken !== null) {
          Galaxy._internalSettings.authenticationContext.EntityId = result.data.EntityToken.Entity.Id;
          authenticationContextUpdates.EntityId = result.data.EntityToken.Entity.Id;
          Galaxy._internalSettings.authenticationContext.EntityType = result.data.EntityToken.Entity.Type;
          authenticationContextUpdates.EntityType = result.data.EntityToken.Entity.Type;
          Galaxy._internalSettings.authenticationContext.EntityToken = result.data.EntityToken.EntityToken;
          authenticationContextUpdates.EntityToken = result.data.EntityToken.EntityToken;
        }
        // Update the authenticationContext with values from the result
        authenticationContext = Object.assign(authenticationContext, authenticationContextUpdates);
        return authenticationContext;
      },

      AuthInfoMap: {
        "X-EntityToken": {
          authAttr: "entityToken",
          authError: "errorEntityToken"
        },
        "X-Authorization": {
          authAttr: "sessionTicket",
          authError: "errorLoggedIn"
        },
        "X-SecretKey": {
          authAttr: "developerSecretKey",
          authError: "errorSecretKey"
        }
      },

      GetAuthInfo: function (request, authKey) {
        // Use the most-recently saved authKey, unless one was provided in the request via the AuthenticationContext
        var authError = Galaxy._internalSettings.AuthInfoMap[authKey].authError;
        var authAttr = Galaxy._internalSettings.AuthInfoMap[authKey].authAttr;
        var defaultAuthValue = null;
        if (authAttr === "entityToken")
          defaultAuthValue = Galaxy._internalSettings.entityToken;
        else if (authAttr === "sessionTicket")
          defaultAuthValue = Galaxy._internalSettings.sessionTicket;
        else if (authAttr === "developerSecretKey")
          defaultAuthValue = Galaxy.settings.developerSecretKey;
        var authValue = request.AuthenticationContext ? request.AuthenticationContext[authAttr] : defaultAuthValue;
        return { "authKey": authKey, "authValue": authValue, "authError": authError };
      },

      ExecuteRequestWrapper: function (apiURL, request, authKey, method, callback, customData, extraHeaders) {
        var authValue = null;
        if (authKey !== null) {
          var authInfo = Galaxy._internalSettings.GetAuthInfo(request, authKey = authKey);
          var authKey = authInfo.authKey, authValue = authInfo.authValue, authError = authInfo.authError;

          if (!authValue) throw authError;
        }
        return Galaxy._internalSettings.ExecuteRequest(Galaxy._internalSettings.GetServerUrl() + apiURL, request, authKey, authValue, method, callback, customData, extraHeaders);
      }
    }
  }

  Galaxy.buildIdentifier = "default_manual_build";
  Galaxy.sdkVersion = "1.0.2";
  Galaxy.GenerateErrorReport = function (error) {
    if (error == null)
      return "";
    var fullErrors = error.errorMessage;
    for (var paramName in error.errorDetails)
      for (var msgIdx in error.errorDetails[paramName])
        fullErrors += "\n" + paramName + ": " + error.errorDetails[paramName][msgIdx];
    return fullErrors;
  };

  Galaxy.prototype.ClientAPI = {
    ForgetAllCredentials: function () {
      Galaxy._internalSettings.sessionTicket = null;
      Galaxy._internalSettings.entityToken = null;
    },

    AssignRoleClanMember: function (request, callback, customData, extraHeaders) {
      return Galaxy._internalSettings.ExecuteRequestWrapper("/client/clans/" + request.clan_id + "/assign_role", request, null, "POST", callback, customData, extraHeaders);
    },

    BanClanMembers: function (request, callback, customData, extraHeaders) {
      return Galaxy._internalSettings.ExecuteRequestWrapper("/client/clans/" + request.clan_id + "/ban_players", request, null, "POST", callback, customData, extraHeaders);
    },

    CreateClan: function (request, callback, customData, extraHeaders) {
      return Galaxy._internalSettings.ExecuteRequestWrapper("/client/clans", request, null, "POST", callback, customData, extraHeaders);
    },

    DeleteClan: function (request, callback, customData, extraHeaders) {
      return Galaxy._internalSettings.ExecuteRequestWrapper("/client/clans/" + request.clan_id, request, null, "DELETE", callback, customData, extraHeaders);
    },

    EditClan: function (request, callback, customData, extraHeaders) {
      return Galaxy._internalSettings.ExecuteRequestWrapper("/client/clans/" + request.clan_id, request, null, "PATCH", callback, customData, extraHeaders);
    },

    FindOpponent: function (request, callback, customData, extraHeaders) {
      return Galaxy._internalSettings.ExecuteRequestWrapper("/client/leaderboards/" + request.leaderboard_id + "/find_opponent", request, null, "GET", callback, customData, extraHeaders);
    },

    GetClan: function (request, callback, customData, extraHeaders) {
      return Galaxy._internalSettings.ExecuteRequestWrapper("/client/clans/" + request.clan_id, request, null, "GET", callback, customData, extraHeaders);
    },

    GetCurrentClan: function (request, callback, customData, extraHeaders) {
      return Galaxy._internalSettings.ExecuteRequestWrapper("/client/clans/current", request, null, "GET", callback, customData, extraHeaders);
    },

    GetLeaderboard: function (request, callback, customData, extraHeaders) {
      return Galaxy._internalSettings.ExecuteRequestWrapper("/client/leaderboards/" + request.leaderboard_id, request, null, "GET", callback, customData, extraHeaders);
    },

    GetPlayerFriends: function (request, callback, customData, extraHeaders) {
      return Galaxy._internalSettings.ExecuteRequestWrapper("/client/players/" + request.player_id + "/friends", request, null, "GET", callback, customData, extraHeaders);
    },

    GetPlayerProfile: function (request, callback, customData, extraHeaders) {
      return Galaxy._internalSettings.ExecuteRequestWrapper("/client/players/" + request.player_id + "/profile", request, null, "GET", callback, customData, extraHeaders);
    },

    GetPlayerNotifications: function (request, callback, customData, extraHeaders) {
      return Galaxy._internalSettings.ExecuteRequestWrapper("/client/players/" + request.player_id + "/notifications", request, null, "GET", callback, customData, extraHeaders);
    },

    GetPlayerRecord: function (request, callback, customData, extraHeaders) {
      return Galaxy._internalSettings.ExecuteRequestWrapper("/client/leaderboards/" + request.leaderboard_id + "/players/" + request.player_id, request, null, "GET", callback, customData, extraHeaders);
    },

    GetState: function (request, callback, customData, extraHeaders) {
      return Galaxy._internalSettings.ExecuteRequestWrapper("/client/players/get_state", request, null, "GET", callback, customData, extraHeaders);
    },

    JoinClan: function (request, callback, customData, extraHeaders) {
      return Galaxy._internalSettings.ExecuteRequestWrapper("/client/clans/join", request, null, "POST", callback, customData, extraHeaders);
    },

    LeaveClan: function (request, callback, customData, extraHeaders) {
      return Galaxy._internalSettings.ExecuteRequestWrapper("/client/clans/leave", request, null, "POST", callback, customData, extraHeaders);
    },

    RemoveClanMembers: function (request, callback, customData, extraHeaders) {
      return Galaxy._internalSettings.ExecuteRequestWrapper("/client/clans/" + request.clan_id + "/remove_players", request, null, "POST", callback, customData, extraHeaders);
    },

    ReportScore: function (request, callback, customData, extraHeaders) {
      return Galaxy._internalSettings.ExecuteRequestWrapper("/client/leaderboards/" + request.leaderboard_id + "/report_score", request, null, "POST", callback, customData, extraHeaders);
    },

    SaveState: function (request, callback, customData, extraHeaders) {
      return Galaxy._internalSettings.ExecuteRequestWrapper("/client/players/save_state", request, null, "GET", callback, customData, extraHeaders);
    },

    UpdatePlayerProfile: function (request, callback, customData, extraHeaders) {
      return Galaxy._internalSettings.ExecuteRequestWrapper("/client/players/" + request.player_id + "/profile", request, null, "GET", callback, customData, extraHeaders);
    },

  };




  /**
   * initialize the SDK.
   * args: SDK configuration
   * onSuccess: Success callback - called after successful SDK initialization.
   * onError: Error callback - called when error occurs during initialization.
   */
  Galaxy.prototype.InitSDK = function (args, onSuccess, onError) {
    argscheck.checkArgs('O', 'Galaxy.InitSDK', arguments);

    Galaxy._internalSettings.publishableKey = args.publishableKey;

    token = global.localStorage.getItem(Galaxy._internalSettings.tokenStorageKey);
    if (!token) {
      signInAnonymously();
    }

    if (!args) {
      if (onError) {
        onError(GalaxyError.INVALID_ARGUMENT_ERROR);
      }
    } else {
      if (args.publishableKey !== undefined && typeof args.publishableKey != 'string') {
        if (onError) {
          onError(GalaxyError.PUBLISHABLE_KEY_NOT_VALID);
        }
      } else {
        exec(onSuccess, onError, 'GalaxyPlugin', 'InitSDK', [args]);

        callbackMap.convSuc = onSuccess;
        callbackMap.convErr = onError;
      }
    }
  };

  /**
   * onSuccess: Success callback - called after receiving data on App Open Attribution.
   * onError: Error callback - called when error occurs.
   */
  Galaxy.prototype.ShowAvatarEditor = function (onSuccess, onError) {
    argscheck.checkArgs('FF', 'Galaxy.ShowAvatarEditor', arguments);

    callbackMap.attrSuc = onSuccess;
    callbackMap.attrErr = onError;

    var userInfo = getUserInfo();
    showWebview(Galaxy._internalSettings.productionAppUrl + '/players/' + userInfo.user_id + '/edit');

    exec(onSuccess, onError, 'GalaxyPlugin', 'ShowAvatarEditor', []);
  };

  /**
   * onSuccess: Success callback - called after receiving data on App Open Attribution.
   * onError: Error callback - called when error occurs.
   */
  Galaxy.prototype.ShowClan = function ({ leaderboard_id, clan_id }, onSuccess, onError) {
    argscheck.checkArgs('OFF', 'Galaxy.ShowClan', arguments);

    callbackMap.attrSuc = onSuccess;
    callbackMap.attrErr = onError;

    showWebview(Galaxy._internalSettings.productionAppUrl + '/leaderboards/' + leaderboard_id + '/clans/' + clan_id);

    exec(onSuccess, onError, 'GalaxyPlugin', 'ShowClan', []);
  };

  /**
   * onSuccess: Success callback - called after receiving data on App Open Attribution.
   * onError: Error callback - called when error occurs.
   */
  Galaxy.prototype.ShowLeaderboard = function ({ leaderboard_id }, onSuccess, onError) {
    argscheck.checkArgs('SFF', 'Galaxy.ShowLeaderboard', arguments);

    callbackMap.attrSuc = onSuccess;
    callbackMap.attrErr = onError;

    showWebview(Galaxy._internalSettings.productionAppUrl + '/leaderboards/' + leaderboard_id);

    exec(onSuccess, onError, 'GalaxyPlugin', 'ShowLeaderboard', []);
  };

  module.exports = new Galaxy();

  // Internal
  function signInAnonymously() {
    Galaxy._internalSettings.ExecuteRequestWrapper('/signup/anonymous', {
      bundle_id: '',
      device_id: '',
    }, null, "POST", (response) => {
      if (response) {
        token = response.errorMessage;
        if (token) {
          global.localStorage.setItem(Galaxy._internalSettings.tokenStorageKey, token);
        }
      } else {
        console.error(response);
      }
    }, null, null);
  }

  function showWebview(url) {
    var target = '_blank';

    var options = 'hideurlbar=no,hidenavigationbuttons=no,location=no,hidden=yes,beforeload=yes';

    token = global.localStorage.getItem(Galaxy._internalSettings.tokenStorageKey);
    inAppBrowserRef = cordova.InAppBrowser.open(url + '?token=' + token, target, options);

    inAppBrowserRef.addEventListener('loadstart', loadStartCallBack);

    inAppBrowserRef.addEventListener('loadstop', loadStopCallBack);

    inAppBrowserRef.addEventListener('loaderror', loadErrorCallBack);

    inAppBrowserRef.addEventListener('beforeload', beforeloadCallBack);

    inAppBrowserRef.addEventListener('message', messageCallBack);
  }

  function loadStartCallBack() {
    // document.getElementById('status-message').innerText = 'loading please wait ...';
  }

  function loadStopCallBack() {
    if (inAppBrowserRef != undefined) {

      // inAppBrowserRef.insertCSS({ code: 'body{font-size: 25px;}' });

      // inAppBrowserRef.executeScript({
      //   code: "\
      //       var message = 'this is the message';\
      //       var messageObj = {my_message: message};\
      //       var stringifiedMessageObj = JSON.stringify(messageObj);\
      //       webkit.messageHandlers.cordova_iab.postMessage(stringifiedMessageObj);"
      // });

      // document.getElementById('status-message').innerText = '';

      inAppBrowserRef.show();
    }
  }

  function loadErrorCallBack(params) {

    // document.getElementById('status-message').innerText = '';

    var scriptErrorMesssage =
      'alert(\'Sorry we cannot open that page. Message from the server is : ' + params.message + '\');'

    inAppBrowserRef.executeScript({ code: scriptErrorMesssage }, executeScriptCallBack);

    inAppBrowserRef.close();

    inAppBrowserRef = undefined;

  }

  function executeScriptCallBack(params) {
    if (params[0] == null) {
      // document.getElementById('status-message').innerText = 'Sorry we couldn\'t open that page. Message from the server is : \'' + params.message + '\'';
    }
  }

  function beforeloadCallBack(params, callback) {
    if (params.url.indexOf('close_window') != -1) {
      inAppBrowserRef.close();
    }

    if (params.url.indexOf('save_token') != -1) {
      token = params.url.split('token=')[1].split('&')[0];
      global.localStorage.setItem(Galaxy._internalSettings.tokenStorageKey, token);
    }

    if (params.url.indexOf('sdk_action') != -1) {
      if (params.url.indexOf('request_contacts') != -1) {
        // GetContacts();
      }

      if (params.url.indexOf('request_contacts') != -1) {
        // if (shouldCloseOnNextSignInNotification) {
        //   shouldCloseOnNextSignInNotification = false;
        //   Hide();
        // }
        // if (didSignIn != null) { didSignIn(currentPlayerId); }
      }

      if (params.url.indexOf('avatar_edited') != -1) {
        // GetPlayerAvatarTexture((texture) => {
        //   if (avatarDidChange != null) { avatarDidChange(texture); }
        // }, currentPlayerId, true);

        // GalaxyClientAPI.GetPlayerProfile(new ClientModels.GetPlayerProfileRequest {}, result => {
        //   if (infoDidChange != null) { infoDidChange(result.PlayerProfile); }
        // }, error => { });
      }

      if (params.url.indexOf('invite_friend') != -1) {
        // string[] phoneNumberSeparator = new string[] { "phone_number=" };
        // string[] nameSeparator = new string[] { "name=" };
        // string[] iosSeparator = new string[] { "ios_id=" };
        // string[] androidSeparator = new string[] { "android_id=" };
        // string[] gameSeparator = new string[] { "game_name=" };

        // var phoneNumber = msg.Split(phoneNumberSeparator, System.StringSplitOptions.None)[1].Split('&')[0];
        // var name = msg.Split(nameSeparator, System.StringSplitOptions.None)[1].Split('&')[0];
        // var iOSID = msg.Split(iosSeparator, System.StringSplitOptions.None)[1].Split('&')[0];
        // var androidID = msg.Split(androidSeparator, System.StringSplitOptions.None)[1].Split('&')[0];
        // var gameName = msg.Split(gameSeparator, System.StringSplitOptions.None)[1].Split('&')[0];

        //                   string iosLink = "https://apps.apple.com/app/" + iOSID;
        //                   string androidLink = "https://play.google.com/store/apps/details?id=" + androidID;

        //                   string message = "Hey - I'm playing a game called " + gameName + " and I think you'd like it. Download it here: ";
        // #if UNITY_ANDROID
        // message += androidLink;
        //                   string URL = string.Format("sms:{0}?body={1}", phoneNumber, System.Uri.EscapeDataString(message));
        // Application.OpenURL(URL);
        // #endif

        // #if UNITY_IOS
        // message += iosLink;
        //                   string URL = string.Format("sms:{0}?&body={1}", phoneNumber, System.Uri.EscapeDataString(message));
        // Application.OpenURL(URL);
        // #endif

        inAppBrowserRef.close();
      }

      if (params.url.indexOf('convert_currency') != -1) {
        // string[] amountSeparator = new string[] { "amount=" };
        // string[] pointsSeparator = new string[] { "points=" };
        // string[] currencySeparator = new string[] { "currency=" };

        // var amount = msg.Split(amountSeparator, System.StringSplitOptions.None)[1].Split('&')[0];
        // var points = msg.Split(pointsSeparator, System.StringSplitOptions.None)[1].Split('&')[0];
        // var currencyName = msg.Split(currencySeparator, System.StringSplitOptions.None)[1].Split('&')[0];

        // didBuyCurrency(int.Parse(amount));
      }

    }

    // if (params.url.startsWith('http://www.example.com/')) {

    //   // Load this URL in the inAppBrowser.
    //   callback(params.url);
    // } else {

    //   // The callback is not invoked, so the page will not be loaded.
    //   document.getElementById('status-message').innerText = 'This browser only opens pages on http://www.example.com/';
    // }
  }

  function messageCallBack(params) {
    document.getElementById('status-message').innerText = 'message received: ' + params.data.my_message;
  }

  function getUserInfo() {
    if (!token) {
      return {};
    }

    var parts = token.split('.');
    if (parts.length > 2) {
      var decode = parts[1];
      var padLength = 4 - decode.length % 4;
      if (padLength < 4) {
        decode += new string('=', padLength);
      }
      return JSON.parse(atob(decode));
    }

    return {};
  }

})(window);
