// ==UserScript==
// @name         强制 navigator.maxTouchPoints 返回 0
// @namespace    https://github.com/DemoJameson/Userscripts
// @version      1.0.0
// @description  将 navigator.maxTouchPoints 强制设为返回 0，避免部分网页误将桌面设备识别为移动设备。
// @author       DemoJameson
// @updateURL    https://raw.githubusercontent.com/DemoJameson/Userscripts/main/max-touch-points-zero.user.js
// @downloadURL  https://raw.githubusercontent.com/DemoJameson/Userscripts/main/max-touch-points-zero.user.js
// @match        *://*/*
// @run-at       document-start
// @grant        none
// ==/UserScript==

(function () {
    'use strict';

    const override = function overrideMaxTouchPoints() {
        const defineZeroGetter = function defineZeroGetter(target) {
            if (!target) {
                return false;
            }

            try {
                Object.defineProperty(target, 'maxTouchPoints', {
                    configurable: true,
                    enumerable: true,
                    get() {
                        return 0;
                    }
                });
                return true;
            } catch (error) {
                return false;
            }
        };

        defineZeroGetter(window.Navigator && window.Navigator.prototype);
        defineZeroGetter(window.navigator);
    };

    const script = document.createElement('script');
    script.textContent = `(${override.toString()})();`;
    (document.documentElement || document.head || document.body).appendChild(script);
    script.remove();
})();
