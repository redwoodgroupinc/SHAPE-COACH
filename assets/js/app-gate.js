// The coach runs only inside the ShapeAI Android app, which opens app.html?source=android.
// Anyone else who opens this page in a browser is sent to the website, which describes the
// app and links to Google Play. This runs before the page renders, so nothing flashes.
(function () {
  var fromLaunch = new URLSearchParams(location.search).get('source') === 'android';
  var fromReferrer = document.referrer.indexOf('android-app://net.shapecoach.app') === 0;
  var remembered = false;
  try {
    remembered = sessionStorage.getItem('shapecoach.androidApp') === '1';
  } catch {
    // Storage blocked: rely on the launch URL and referrer.
  }
  if (!fromLaunch && !fromReferrer && !remembered) location.replace('index.html#get-app');
})();
