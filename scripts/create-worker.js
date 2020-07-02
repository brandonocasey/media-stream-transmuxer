const fs = require('fs');
const path = require('path');
const paths = new Map();

module.exports = function(userOptions) {
  userOptions = userOptions || {};
  return {
    resolveId(importee, importer) {
      if (importee === 'rollup-plugin-webworker') {
        return path.resolve(__dirname, 'worker-helper.js');
      } else if (importee.indexOf('worker!') === 0) {
        const name = importee.split('!')[1];
        const target = path.resolve(path.dirname(importer), name);

        paths.set(target, name);
        return target;
      }
    },

    /**
     * Do everything in load so that code loaded by the plugin can still be transformed by the
     * rollup configuration
     */
    load(id) {
      if (!paths.has(id)) {
        return;
      }

      const code =
        "import shimWorker from 'rollup-plugin-webworker'\n" +
        'export default shimWorker(function() {\n' +
        '  const self = this;\n' +
        fs.readFileSync(id, 'utf-8') +
        '});';

      return code;
    }
  };
};
