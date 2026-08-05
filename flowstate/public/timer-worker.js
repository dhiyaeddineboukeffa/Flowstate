let intervalId = null;

self.onmessage = function(e) {
  if (e.data === 'start') {
    if (!intervalId) {
      intervalId = setInterval(() => {
        postMessage('tick');
      }, 1000);
    }
  } else if (e.data === 'stop') {
    if (intervalId) {
      clearInterval(intervalId);
      intervalId = null;
    }
  }
};
