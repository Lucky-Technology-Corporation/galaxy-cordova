<p align="center">
  <img a src="https://uploads-ssl.webflow.com/632b845203cf40e09d13ecb4/632b8cf5cf48fdcdc7ae834c_galaxy_newlogo-p-500.png" width="600">
</p>

<h1>
  <p align="center">
    Cordova Galaxy plugin for Android and iOS.
  </p>
</h1>

## Table of content

- [Installation](#installation)
- [Setup](#setup)

## <a id="installation">Installation</a>

```
$ cordova plugin add cordova-plugin-galaxy
```

## <a id="setup">Setup</a>

Add the following lines to your code to be able to initialize tracking with your own Galaxy Publishable key:


```javascript
document.addEventListener('deviceready', function() {

  // InitSDK
  window.galaxy.InitSDK({
    publishableKey: 'Your Galaxy Publishable Key',
  }, (result) => {
    console.log(result);
  }, (error) => {
    console.error(error);
  });

  // ShowLeaderboard
  document.getElementById('button').addEventListener('click', (e) => window.galaxy.ShowLeaderboard({
    leaderboard_id: 'Your Leaderboard Id',
  }, (result) => {
    console.log(result);
  }, (error) => {
    console.error(error);
  }));

  // ReportScore
  document.getElementById('button').addEventListener('click', (e) => window.galaxy.ClientAPI.ReportScore({
    leaderboard_id: 'Your Leaderboard Id',
    score: 1,
  },
  (result, error) => {
    console.log(result);
  }));

  // ShowAvatarEditor
  document.getElementById('button').addEventListener('click', (e) => window.galaxy.ShowAvatarEditor((result) => {
    console.log(result);
  }, (error) => {
    console.error(error);
  }));

  // ShowClan
  document.getElementById('button').addEventListener('click', (e) => window.galaxy.ShowClan({
    leaderboard_id: 'Your Leaderboard Id',
    clan_id: 'clan id'
  }, (result) => {
    console.log(result);
  }, (error) => {
    console.error(error);
  }));

 }, false);
```
---
