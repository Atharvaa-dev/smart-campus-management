(function configureSmartCampus() {
  const localApi = !window.location
    || (window.location.hostname === 'localhost' && window.location.port === '5500');

  window.SMART_CAMPUS_CONFIG = {
    apiBaseUrl: localApi ? 'http://localhost:3000/api' : '/api',
  };
}());
