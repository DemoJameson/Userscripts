// ==UserScript==
// @name        拷贝漫画简易阅读
// @namespace   https://github.com/DemoJameson/Userscripts
// @match       *://*.copymanga.com/comic/*/chapter/*
// @match       *://*.copymanga.org/comic/*/chapter/*
// @match       *://*.copymanga.site/comic/*/chapter/*
// @match       *://*.copymanga.tv/comic/*/chapter/*
// @match       *://*.mangacopy.com/comic/*/chapter/*
// @match       *://*.2025copy.com/comic/*/chapter/*
// @grant       GM_registerMenuCommand
// @grant       GM_unregisterMenuCommand
// @grant       GM_setValue
// @grant       GM_getValue
// @grant       unsafeWindow
// @version     1.27
// @author      chemPolonium & DemoJameson
// @description 简单的拷贝漫画阅读器，J/K 翻页，左右方向键改变章节，分号键奇偶切换，1/2 改变单双页，扩展菜单/B 键调节亮度
// @run-at      document-end
// @license     GPLv3
// @downloadURL https://raw.githubusercontent.com/DemoJameson/Userscripts/main/copymanaga.user.js
// @updateURL   https://raw.githubusercontent.com/DemoJameson/Userscripts/main/copymanaga.user.js
// ==/UserScript==

/* 原脚本来自 GreasyFork 432020（作者 chemPolonium，GPLv3），本文件为其修改版 */

/* jshint esversion: 6 */
/* jshint multistr: true */
(function() {
  'use strict';

  // 声明了 GM_* 授权后脚本会跑在沙盒里，页面自身的 window 通过 unsafeWindow 访问
  const pageWindow = (typeof unsafeWindow !== 'undefined' && unsafeWindow) ? unsafeWindow : window;

  document.getElementsByClassName('header')[0].remove();

  let comicContainerFluid = document.getElementsByClassName('container-fluid comicContent')[0];
  comicContainerFluid.style.paddingRight = '0px';
  comicContainerFluid.style.paddingLeft = '0px';

  let comicContainer = comicContainerFluid.children[0];
  comicContainer.style.marginRight = '0px';
  comicContainer.style.marginLeft = '0px';
  comicContainer.style.setProperty('min-width', '10px', 'important');
  comicContainer.style.setProperty('max-width', '100%', 'important');

  let comicList = comicContainer.children[0];
  comicList.style.paddingTop = '0px';
  comicList.style.marginBottom = '0px';
  comicList.style.setProperty('min-width', '10px', 'important');
  comicList.style.setProperty('max-width', '100%', 'important');
  comicList.style.setProperty('width', '100%', 'important');
  comicList.style.display = 'grid';
  comicList.style.direction = 'rtl';

  let comicListChildren = comicList.children;
  let currentImageIndex = 0;

  let comicIndex = document.getElementsByClassName('comicIndex')[0];
  let comicCount = document.getElementsByClassName('comicCount')[0];

  function refreshIndex() {
    comicIndex.textContent = currentImageIndex;
  }

  function getImage(imageIndex) {
    return comicListChildren[imageIndex].children[0];
  }

  function getCurrentImage() {
    return getImage(currentImageIndex);
  }

  function moveToCurrentImage() {
    if (currentImageIndex == 0) {
      window.scrollTo(0, 0);
    } else {
      window.scrollTo(0, getCurrentImage().offsetTop);
    }
  }

  let pageNumPerScreen = 2;

  function preloadImage() {
    // simulate the scroll for preload
    // the script is like this: total client height / 3 < window scrollY then not load
    // so first scroll Y to 0
    window.scrollTo(0, 0);
    for (let i = 0; i < pageNumPerScreen; i++) {
      // window.dispatchEvent(scrollEvent);
      if (typeof pageWindow.onscroll === 'function') {
        pageWindow.onscroll();
      }
      // dispatch the scroll event for preload
    }
    // this function will scroll Y to 0
  }

  function moveImageIndex(x) {
    let newImageIndex = currentImageIndex + x;
    if (newImageIndex < comicList.children.length && newImageIndex >= 0) {
      currentImageIndex = newImageIndex;
    }
  }

  function setSingleAlign(imageIndex) {
    if (pageNumPerScreen == 1)
    {
      comicListChildren[imageIndex].children[0].style.objectPosition = 'center';
      // ('style', 'text-align: center;');
    }
    if (pageNumPerScreen == 2)
    {
      comicListChildren[imageIndex].children[0].style.objectPosition = (imageIndex % 2 == 0) ? 'left' : 'right';
    }
  }

  function setAlign() {
    for (let imageIndex = 0; imageIndex < comicListChildren.length; imageIndex++) {
      setSingleAlign(imageIndex);
    }
  }

  function setPageNumPerScreen(pageNum) {
    comicList.style.gridTemplateColumns = 'repeat(' + String(pageNum) + ', 1fr)';
    moveToCurrentImage();
    pageNumPerScreen = pageNum;
    setAlign();
  }

  setPageNumPerScreen(2);

  function onePageDown() {
    if (comicCount.textContent - currentImageIndex <= 1) {
      window.location = nextChapterHref;
    }

    preloadImage();
    moveImageIndex(pageNumPerScreen);
    moveToCurrentImage();
    refreshIndex();
  }

  function onePageUp() {
    if (currentImageIndex <= 1) {
      window.location = prevChapterHref;
    }

    moveImageIndex(-pageNumPerScreen);
    moveToCurrentImage();
    refreshIndex();
  }

  function createTitlePage() {
    let titlePage = document.createElement('li');
    let titlePageDiv = document.createElement('div');
    let titlePageTitle = document.createElement('p');
    titlePageTitle.appendChild(document.createTextNode(document.title));
    titlePageTitle.setAttribute('style', 'color: white;\
      font-size: xx-large;\
      max-width: 30vw;\
      margin-top: 30%;\
      margin-right: 20%;\
      white-space: normal;');
    titlePageDiv.appendChild(titlePageTitle);
    titlePage.appendChild(titlePageDiv);
    return titlePage;
  }

  function resizeImage(targetli) {
    targetli.style.height = '100vh';
    targetli.style.maxWidth = '100%';
    targetli.firstChild.style.setProperty('height', '100%', 'important');
    targetli.firstChild.style.setProperty('width', '100%', 'important');
    targetli.firstChild.style.objectFit = 'contain';
  }

  function setAllPages() {
    for (let i = 1; i < comicListChildren.length; i++) {
      if (comicListChildren[i].children[0]) {
        resizeImage(comicListChildren[i]);
      }
    }
  }

  let titlePage = createTitlePage();

  let parityChanged = false;

  function switchParity() {
    if (parityChanged) {
      comicListChildren[0].remove();
    } else {
      comicList.insertAdjacentElement('afterbegin', titlePage);
    }
    parityChanged = !parityChanged;
    setAlign();
    moveToCurrentImage();
  }

  let footer = document.getElementsByClassName('footer')[0];
  let footerChildren = footer.children;
  let prevChapterHref = footerChildren[1].children[0].href;
  let nextChapterHref = footerChildren[3].children[0].href;
  let chapterListHref = footerChildren[4].children[0].href;

  let brightnessMenuCommandId = null;
  let brightnessPanel = null;
  let brightnessRange = null;
  let brightnessValueLabel = null;
  let brightnessMask = null;
  const BRIGHTNESS_STORAGE_KEY = 'copymangaSimpleReaderBrightness';

  function clampBrightness(value) {
    let num = parseInt(value, 10);
    if (isNaN(num)) {
      return 100;
    }
    if (num < 0) {
      return 0;
    }
    if (num > 100) {
      return 100;
    }
    return num;
  }

  function getPageLocalStorage() {
    try {
      return pageWindow.localStorage || localStorage || null;
    } catch (e) {
      return null;
    }
  }

  function readStoredBrightness() {
    let stored = null;
    try {
      if (typeof GM_getValue === 'function') {
        stored = GM_getValue(BRIGHTNESS_STORAGE_KEY, null);
      }
    } catch (e) {
      stored = null;
    }
    if (stored === null || stored === undefined || stored === '') {
      let storage = getPageLocalStorage();
      if (storage) {
        stored = storage.getItem(BRIGHTNESS_STORAGE_KEY);
      }
    }
    return clampBrightness(stored === null || stored === undefined ? 100 : stored);
  }

  function storeBrightness(value) {
    try {
      if (typeof GM_setValue === 'function') {
        GM_setValue(BRIGHTNESS_STORAGE_KEY, value);
        return;
      }
    } catch (e) {
      // 忽略，退回到 localStorage
    }
    let storage = getPageLocalStorage();
    if (storage) {
      storage.setItem(BRIGHTNESS_STORAGE_KEY, String(value));
    }
  }

  function applyBrightness(value) {
    currentBrightness = clampBrightness(value);
    applyBrightnessMask(currentBrightness);
    if (brightnessRange) {
      brightnessRange.value = currentBrightness;
    }
    if (brightnessValueLabel) {
      brightnessValueLabel.textContent = currentBrightness + '%';
    }
    storeBrightness(currentBrightness);
    refreshBrightnessMenuCommand();
  }

  // 压暗用一层纯黑遮罩实现，而不是给漫画列表加 filter: brightness()。
  // 黑色叠加的结果 pixel * (1 - a) 和 brightness(1 - a) 完全等价，但漫画列表在
  // 长章节里高度能到十几万像素，给它挂滤镜会逼浏览器做整块图层合成，长章节容易掉帧；
  // 遮罩只有一屏大小，几乎不花代价。懒加载出来的新页面同样自动生效。
  function applyBrightnessMask(value) {
    if (value >= 100) {
      if (brightnessMask) {
        brightnessMask.style.display = 'none';
      }
      return;
    }
    if (!brightnessMask) {
      brightnessMask = document.createElement('div');
      brightnessMask.id = 'copymanga-brightness-mask';
      brightnessMask.style.cssText = 'position: fixed;\
        top: 0;\
        left: 0;\
        right: 0;\
        bottom: 0;\
        background: #000;\
        pointer-events: none;\
        z-index: 2147483646;';
      document.body.appendChild(brightnessMask);
    }
    brightnessMask.style.display = 'block';
    brightnessMask.style.opacity = String((100 - value) / 100);
  }

  function createBrightnessPanel() {
    brightnessPanel = document.createElement('div');
    brightnessPanel.id = 'copymanga-brightness-panel';
    brightnessPanel.style.cssText = 'position: fixed;\
      top: 12px;\
      right: 12px;\
      z-index: 2147483647;\
      display: none;\
      box-sizing: border-box;\
      width: 240px;\
      padding: 12px 14px;\
      border-radius: 10px;\
      background: rgba(28, 28, 30, 0.92);\
      color: #f2f2f7;\
      font: 13px/1.5 -apple-system, "Microsoft YaHei", sans-serif;\
      box-shadow: 0 6px 24px rgba(0, 0, 0, 0.4);\
      user-select: none;';

    let head = document.createElement('div');
    head.style.cssText = 'display: flex;\
      justify-content: space-between;\
      align-items: center;\
      margin-bottom: 8px;';
    let headTitle = document.createElement('span');
    headTitle.textContent = '亮度调节';
    brightnessValueLabel = document.createElement('span');
    brightnessValueLabel.style.fontWeight = 'bold';
    head.appendChild(headTitle);
    head.appendChild(brightnessValueLabel);

    brightnessRange = document.createElement('input');
    brightnessRange.type = 'range';
    brightnessRange.min = '0';
    brightnessRange.max = '100';
    brightnessRange.step = '1';
    brightnessRange.value = String(currentBrightness);
    brightnessRange.style.cssText = 'width: 100%;\
      margin: 0;\
      cursor: pointer;';
    brightnessRange.addEventListener('input', () => {
      applyBrightness(brightnessRange.value);
    });

    let buttonRow = document.createElement('div');
    buttonRow.style.cssText = 'display: flex;\
      justify-content: space-between;\
      margin-top: 10px;';
    let resetButton = document.createElement('button');
    resetButton.textContent = '恢复默认';
    let closeButton = document.createElement('button');
    closeButton.textContent = '关闭';
    for (let button of [resetButton, closeButton]) {
      button.style.cssText = 'flex: 1;\
        margin: 0 3px;\
        padding: 4px 0;\
        border: 1px solid rgba(255, 255, 255, 0.25);\
        border-radius: 6px;\
        background: transparent;\
        color: #f2f2f7;\
        font: inherit;\
        cursor: pointer;';
    }
    resetButton.addEventListener('click', () => {
      applyBrightness(100);
    });
    closeButton.addEventListener('click', () => {
      toggleBrightnessPanel(false);
    });
    buttonRow.appendChild(resetButton);
    buttonRow.appendChild(closeButton);

    brightnessPanel.appendChild(head);
    brightnessPanel.appendChild(brightnessRange);
    brightnessPanel.appendChild(buttonRow);
    document.body.appendChild(brightnessPanel);
  }

  function toggleBrightnessPanel(forceShow) {
    if (!brightnessPanel) {
      createBrightnessPanel();
    }
    let shouldShow = forceShow === undefined ? brightnessPanel.style.display === 'none' : forceShow;
    brightnessPanel.style.display = shouldShow ? 'block' : 'none';
  }

  function refreshBrightnessMenuCommand() {
    if (typeof GM_registerMenuCommand !== 'function') {
      return;
    }
    const label = '调节亮度（当前 ' + currentBrightness + '%）';
    if (brightnessMenuCommandId !== null && typeof GM_unregisterMenuCommand === 'function') {
      GM_unregisterMenuCommand(brightnessMenuCommandId);
    }
    brightnessMenuCommandId = GM_registerMenuCommand(label, () => {
      toggleBrightnessPanel();
    });
  }

  let currentBrightness = readStoredBrightness();
  applyBrightness(currentBrightness);

  function toggleFullScreen() {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen();
    } else {
      if (document.exitFullscreen) {
        document.exitFullscreen();
      }
    }
  }

  document.addEventListener('keydown', (event) => {
    switch (event.code) {
      case 'ArrowRight':
        window.location = nextChapterHref;
        break;
      case 'ArrowLeft':
        window.location = prevChapterHref;
        break;
      case 'KeyK':
      case 'KeyS':
        onePageUp();
        break;
      case 'KeyJ':
      case 'KeyD':
        onePageDown();
        break;
      case 'KeyL':
        window.location = chapterListHref;
        break;
      case 'KeyR':
        setAllPages();
        break;
      case 'KeyF':
      case 'KeyH':
        toggleFullScreen();
        break;
      // 扩展菜单不可用时（比如脚本管理器不支持）的备用入口
      case 'KeyB':
        toggleBrightnessPanel();
        break;
      case 'Semicolon':
        switchParity();
        break;
      case 'Digit1':
        setPageNumPerScreen(1);
        break;
      case 'Digit2':
        setPageNumPerScreen(2);
        break;
      default:
        console.log('key: ' + event.key + ' code: ' + event.code);
    }
  });

  footer.remove();

  let firstLoad = true;

  const comicListObserverConfig = { childList: true };

  const firstLoadCallback = () => {
    if (firstLoad && comicListChildren.length > 0) {
      firstLoad = false;
      switchParity();
      // 有时脚本加载得慢，会导致前几页来不及修改大小，因此第一次直接全设置一遍
      setAllPages();
    }
  };

  const comicListCallback = (mutationList, observer) => {
    for (const mutation of mutationList) {
      firstLoadCallback();
      for (const targetli of mutation.addedNodes) {
        resizeImage(targetli);
        // 一般一次也就加载一页或两页，加载两页的话只设置最后一页的左右是不够的
        setSingleAlign(comicListChildren.length - 2);
        setSingleAlign(comicListChildren.length - 1);
      }
    }
  };

  const comicListObserver = new MutationObserver(comicListCallback);

  comicListObserver.observe(comicList, comicListObserverConfig);

  // 有的时候会出现列表加载完了，脚本还没加载上的情况，这时候 MutationObserver 会失效
  // 这个时候就手动加个延时当作第一次调用
  setTimeout(firstLoadCallback, 50);

  // 下面是旧版的监听方式，已经被 observer 取代
  // comicList.addEventListener('DOMNodeInserted', (event) => {
  //   if (firstLoad && comicListChildren.length > 2) {
  //     firstLoad = false;
  //     switchParity();
  //   }
  //   resizeImage(event.target);
  //   // event.target.style.height = '100vh';
  //   // event.target.style.maxWidth = '100%';
  //   // event.target.firstChild.style.setProperty('height', '100%', 'important');
  //   // event.target.firstChild.style.setProperty('width', '100%', 'important');
  //   // event.target.firstChild.style.objectFit = 'contain';
  //   setSingleAlign(comicListChildren.length - 1);
  // });

})();