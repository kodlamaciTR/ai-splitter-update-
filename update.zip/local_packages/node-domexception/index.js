// Local warning-free replacement of node-domexception using native DOMException
if (!globalThis.DOMException) {
  try {
    atob(0);
  } catch (err) {
    globalThis.DOMException = err.constructor;
  }
}

module.exports = globalThis.DOMException;
