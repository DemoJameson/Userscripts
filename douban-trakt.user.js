// ==UserScript==
// @name         豆瓣影视添加 Trakt 待看按钮
// @namespace    https://github.com/DemoJameson/Userscripts
// @version      1.3.1
// @description  在豆瓣电影和剧集页面添加 Trakt 待看按钮，并提供可切换的调试日志。
// @author       DemoJameson
// @updateURL    https://raw.githubusercontent.com/DemoJameson/Userscripts/main/douban-trakt.user.js
// @downloadURL  https://raw.githubusercontent.com/DemoJameson/Userscripts/main/douban-trakt.user.js
// @match        https://movie.douban.com/subject/*
// @match        https://m.douban.com/movie/subject/*
// @grant        GM_xmlhttpRequest
// @grant        GM_setValue
// @grant        GM_getValue
// @grant        GM_registerMenuCommand
// @grant        GM_addStyle
// @connect      api.trakt.tv
// @connect      api.tmdb.org
// @connect      frodo.douban.com
// ==/UserScript==

(function () {
    'use strict';

    const BTN_STYLE = `
        display: inline-block;
        padding: 2px 8px;
        margin-left: 8px;
        background-color: #9F42C6;
        color: #fff;
        border-radius: 3px;
        text-decoration: none;
        font-size: 12px;
        cursor: pointer;
        border: none;
        vertical-align: baseline;
        position: relative;
        top: -1px;
        transition: background-color 0.2s;
    `;

    const MOBILE_STYLE = `
            .trakt-mobile-actions {
                display: flex;
                align-items: center;
                justify-content: flex-start;
                gap: 10px;
                margin: 5px 0 10px;
            }

            .trakt-mobile-actions .trakt-mark-btn,
            .trakt-mobile-actions .trakt-open-btn {
                display: inline-flex;
                align-items: center;
                justify-content: center;
                min-width: 0;
                color: #fff;
                padding: .08rem .2rem;
                border: 1px solid #9F42C6;
                border-radius: .04rem;
                background: #9F42C6;
                box-sizing: border-box;
                font-size: .12rem;
                line-height: 1;
                text-decoration: none;
            }

            .trakt-mobile-actions .trakt-mark-btn.is-disabled,
            .trakt-mobile-actions .trakt-open-btn.is-disabled {
                opacity: 0.55;
                pointer-events: none;
            }

            .trakt-mobile-actions .trakt-mark-btn .trakt-mark-icon {
                display: none;
            }

            .trakt-mobile-row {
                display: flex;
                align-items: center;
                gap: 6px;
                margin-top: 10px !important;
                line-height: 1.3;
                white-space: nowrap;
            }

            .trakt-mobile-row .pl {
                display: inline;
                margin-right: 0;
                color: #111;
                font-size: 12px;
            }

            #info .trakt-meta-inline,
            .trakt-mobile-row .trakt-meta-inline {
                display: inline-flex;
                flex-wrap: nowrap;
                align-items: center;
                gap: 6px;
                white-space: nowrap !important;
                vertical-align: middle;
                max-width: 100%;
            }

            #info .trakt-meta-inline .trakt-link,
            .trakt-mobile-row .trakt-meta-inline .trakt-link {
                color: #35b15c;
                font-size: 12px;
                line-height: 1.2;
                text-decoration: none;
                overflow-wrap: normal;
                word-break: normal;
            }

            #info .trakt-meta-inline .trakt-watchlist-btn,
            .trakt-mobile-row .trakt-meta-inline .trakt-watchlist-btn {
                min-width: 0;
                padding: 5px 12px !important;
                margin-left: 0 !important;
                flex: 0 0 auto;
                border: 1px solid #e9e9e9 !important;
                border-radius: 5px !important;
                background: #fff !important;
                color: #111 !important;
                font-size: 12px !important;
                font-weight: 600;
                line-height: 1.2;
                position: static !important;
                top: auto !important;
                box-shadow: none;
            }

            #info .trakt-meta-inline .trakt-watchlist-btn[data-action="add"],
            .trakt-mobile-row .trakt-meta-inline .trakt-watchlist-btn[data-action="add"] {
                border-color: #f3e1b4 !important;
                color: #111 !important;
            }

            #info .trakt-meta-inline .trakt-watchlist-btn[data-action="remove"],
            .trakt-mobile-row .trakt-meta-inline .trakt-watchlist-btn[data-action="remove"] {
                border-color: #f3e1b4 !important;
                color: #111 !important;
            }

            #info .trakt-meta-inline .trakt-watchlist-btn:disabled,
            .trakt-mobile-row .trakt-meta-inline .trakt-watchlist-btn:disabled {
                color: #999 !important;
                background: #f5f5f5 !important;
                border-color: #e5e5e5 !important;
                box-shadow: none;
            }
    `;

    // 修复 PC 端豆瓣网页添加片单图标背景色不为透明
    const DESKTOP_STYLE = `
            .lnk-doulist-add i {
                background-color: transparent !important;
            }
    `;

    const TRAKT_API_URL = 'https://api.trakt.tv';
    const TRAKT_CLIENT_ID = 'ae3b79dfd82d72aeab14337550d6762b9f161ddd5eea99e8ca1e2ddb0d484ecc';
    const TRAKT_CLIENT_SECRET = '045f13defe55c1562ef7df44a67d0762843649aadaf15b8314620f50051f5b46';
    const TMDB_API_URL = 'https://api.tmdb.org';
    const TMDB_API_KEY = 'ebb2c093078553178d5d75c6d86d7bde';
    const DOUBAN_FRODO_API_URL = 'https://frodo.douban.com/api/v2/movie';
    const DOUBAN_FRODO_API_KEY = '0ac44ae016490db2204ce0a042db2916';
    const ACCESS_TOKEN_KEY = 'trakt_access_token';
    const REFRESH_TOKEN_KEY = 'trakt_refresh_token';
    const TOKEN_EXPIRES_AT_KEY = 'trakt_token_expires_at';
    const DEBUG_KEY = 'trakt_debug_enabled';
    const DEVICE_AUTH_TIMEOUT = 180000;
    const DEVICE_AUTH_FALLBACK_INTERVAL = 5000;

    let accessToken = GM_getValue(ACCESS_TOKEN_KEY, '');
    let refreshToken = GM_getValue(REFRESH_TOKEN_KEY, '');
    let tokenExpiresAt = Number(GM_getValue(TOKEN_EXPIRES_AT_KEY, 0)) || 0;
    let debugEnabled = GM_getValue(DEBUG_KEY, false);

    if (location.hostname === 'movie.douban.com') {
        GM_addStyle(DESKTOP_STYLE);
    }

    function injectMobileStyle() {
        if (document.getElementById('trakt-mobile-style')) return;

        const style = document.createElement('style');
        style.id = 'trakt-mobile-style';
        style.textContent = MOBILE_STYLE;
        document.head.appendChild(style);
    }

    function debugLog(message, details) {
        if (!debugEnabled) return;
        if (details === undefined) {
            console.log('[豆瓣 Trakt 调试]', message);
            return;
        }

        console.log('[豆瓣 Trakt 调试]', message, details);
    }

    function debugError(message, details) {
        if (!debugEnabled) return;
        console.error('[豆瓣 Trakt 调试]', message, details);
    }

    function setDebugEnabled(enabled) {
        debugEnabled = enabled;
        GM_setValue(DEBUG_KEY, enabled);
        console.info(`[豆瓣 Trakt] 调试已${enabled ? '启用' : '关闭'}。`);
        alert(`豆瓣 Trakt 调试已${enabled ? '启用' : '关闭'}，如有需要请刷新页面。`);
    }

    GM_registerMenuCommand(
        debugEnabled ? '关闭调试' : '启用调试',
        function () {
            setDebugEnabled(!debugEnabled);
        }
    );

    GM_registerMenuCommand('清除 Trakt Token', function () {
        if (!accessToken) {
            alert('当前没有已保存的 Trakt Token。');
            return;
        }

        const confirmed = confirm('确定要清除当前保存的 Trakt Token 吗？清除后需要重新授权。');
        if (!confirmed) return;

        clearAccessToken();
        location.reload();
    });

    debugLog('脚本已加载', {
        url: location.href,
        hasAccessToken: Boolean(accessToken)
    });

    function createModal(html) {
        const overlay = document.createElement('div');
        overlay.style.cssText = `
            position: fixed;
            top: 0;
            left: 0;
            width: 100vw;
            height: 100vh;
            background: rgba(0, 0, 0, 0.6);
            z-index: 999999;
            display: flex;
            align-items: center;
            justify-content: center;
        `;

        const modal = document.createElement('div');
        modal.style.cssText = `
            background: #fff;
            padding: 25px;
            border-radius: 8px;
            width: 400px;
            max-width: 90%;
            text-align: center;
            box-shadow: 0 4px 15px rgba(0, 0, 0, 0.2);
            font-family: sans-serif;
        `;
        modal.innerHTML = html;
        overlay.appendChild(modal);
        document.body.appendChild(overlay);
        return overlay;
    }

    function removeModal(overlay) {
        if (overlay?.parentNode) {
            document.body.removeChild(overlay);
        }
    }

    function closePopupWindow(popupWindow) {
        if (!popupWindow || popupWindow.closed) return;

        try {
            popupWindow.close();
        } catch (error) {
            debugError('关闭 Trakt 授权窗口失败', error);
        }
    }

    function saveTraktTokens(data) {
        accessToken = data.access_token || '';
        refreshToken = data.refresh_token || '';
        tokenExpiresAt = data.created_at && data.expires_in
            ? (Number(data.created_at) + Number(data.expires_in)) * 1000
            : 0;

        GM_setValue(ACCESS_TOKEN_KEY, accessToken);
        GM_setValue(REFRESH_TOKEN_KEY, refreshToken);
        GM_setValue(TOKEN_EXPIRES_AT_KEY, tokenExpiresAt);

        debugLog('Trakt token 已保存', {
            hasAccessToken: Boolean(accessToken),
            hasRefreshToken: Boolean(refreshToken),
            tokenExpiresAt: tokenExpiresAt || null
        });
    }

    function getDeviceAuthErrorCode(error) {
        const value = error?.data?.error || error?.data?.error_code || error?.data?.code;
        if (typeof value === 'string' && value) {
            return value;
        }

        switch (error?.status) {
            case 400:
                return 'authorization_pending';
            case 404:
                return 'invalid_device_code';
            case 409:
                return 'already_used';
            case 410:
                return 'expired_token';
            case 418:
                return 'access_denied';
            case 429:
                return 'slow_down';
            default:
                return '';
        }
    }

    function getDeviceAuthErrorMessage(error) {
        const description = error?.data?.error_description;
        if (typeof description === 'string' && description.trim()) {
            return description.trim();
        }

        const code = getDeviceAuthErrorCode(error);
        if (code === 'access_denied') {
            return '你已在 Trakt 拒绝授权，请重新发起连接。';
        }

        if (code === 'expired_token') {
            return 'Trakt 用户码已过期，请重新发起连接。';
        }

        if (code === 'invalid_device_code') {
            return 'Trakt 返回了无效的设备码，请重新发起连接。';
        }

        if (code === 'already_used') {
            return '这个 Trakt 设备码已经使用过，请重新发起连接。';
        }

        if (error?.status) {
            return `授权失败：${error.status}`;
        }

        return '授权过程中发生网络错误。';
    }

    async function wait(ms) {
        await new Promise(function (resolve) {
            setTimeout(resolve, ms);
        });
    }

    async function pollForDeviceToken(deviceCode, intervalSeconds, expiresInSeconds, onStatusChange, isCancelled) {
        const intervalMs = Math.max(Number(intervalSeconds) || 0, 1) * 1000;
        const startedAt = Date.now();
        const expiresMs = Number(expiresInSeconds) > 0
            ? Number(expiresInSeconds) * 1000
            : DEVICE_AUTH_TIMEOUT;

        while (Date.now() - startedAt < expiresMs) {
            if (isCancelled()) return null;

            try {
                const data = await gmRequest({
                    method: 'POST',
                    url: `${TRAKT_API_URL}/oauth/device/token`,
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    data: JSON.stringify({
                        code: deviceCode,
                        client_id: TRAKT_CLIENT_ID,
                        client_secret: TRAKT_CLIENT_SECRET
                    })
                });

                debugLog('设备码换取 token 成功', data);
                return data;
            } catch (error) {
                const errorCode = getDeviceAuthErrorCode(error);
                debugLog('设备码轮询响应', {
                    status: error.status || null,
                    errorCode: errorCode || null,
                    data: error.data || null
                });

                if (errorCode === 'authorization_pending') {
                    onStatusChange('正在等待你在 Trakt 完成确认...');
                    await wait(intervalMs);
                    continue;
                }

                if (errorCode === 'slow_down') {
                    onStatusChange('Trakt 要求放慢轮询频率，继续等待中...');
                    await wait(intervalMs + 5000);
                    continue;
                }

                if (errorCode === 'expired_token' || errorCode === 'access_denied') {
                    throw new Error(getDeviceAuthErrorMessage(error));
                }

                if (!error.status) {
                    throw new Error('授权过程中发生网络错误。');
                }

                throw new Error(getDeviceAuthErrorMessage(error));
            }
        }

        throw new Error('等待 Trakt 授权超时，请重试。');
    }

    function parseResponseBody(responseText) {
        if (!responseText) return null;
        return JSON.parse(responseText);
    }

    function createRequestError(response, fallbackMessage) {
        const error = new Error(fallbackMessage || `请求失败: ${response.status}`);
        error.status = response.status;
        error.responseText = response.responseText;

        try {
            error.data = parseResponseBody(response.responseText);
        } catch (parseError) {
            error.data = response.responseText || null;
        }

        return error;
    }

    function isSuccessfulStatus(status) {
        return status >= 200 && status < 300;
    }

    async function gmRequest(options) {
        debugLog('发起请求', {
            method: options.method || 'GET',
            url: options.url,
            headers: options.headers,
            data: options.data
        });

        const response = await new Promise(function (resolve, reject) {
            GM_xmlhttpRequest({
                ...options,
                onload: resolve,
                onerror: reject
            });
        });

        const responseData = parseResponseBody(response.responseText);
        debugLog('收到响应', {
            method: options.method || 'GET',
            url: options.url,
            status: response.status,
            data: responseData
        });

        if (!isSuccessfulStatus(response.status)) {
            throw createRequestError(response);
        }

        return responseData;
    }

    async function authenticateTrakt() {
        debugLog('开始 Trakt 授权', {
            hasClientId: Boolean(TRAKT_CLIENT_ID),
            hasClientSecret: Boolean(TRAKT_CLIENT_SECRET)
        });

        if (!TRAKT_CLIENT_ID || !TRAKT_CLIENT_SECRET) {
            alert('脚本中未找到 Trakt Client ID 或 Secret，请检查代码。');
            return;
        }

        let overlay = null;
        let authWindow = null;

        try {
            const deviceData = await gmRequest({
                method: 'POST',
                url: `${TRAKT_API_URL}/oauth/device/code`,
                headers: {
                    'Content-Type': 'application/json'
                },
                data: JSON.stringify({
                    client_id: TRAKT_CLIENT_ID
                })
            });

            debugLog('已收到设备码授权响应', deviceData);

            if (!deviceData?.device_code || !deviceData?.user_code || !deviceData?.verification_url) {
                alert(`授权失败:\n${JSON.stringify(deviceData)}`);
                return;
            }

            let cancelled = false;
            const verificationUrl = `${deviceData.verification_url.replace(/\/$/, '')}/${deviceData.user_code}`;
            overlay = createModal(`
                <h3 style="margin-top:0; color:#ED1C24;">Trakt 用户码连接</h3>
                <p style="font-size:14px; color:#333; margin-bottom:12px; line-height:1.6;">
                    请打开 Trakt 验证页面并输入下面的用户码完成授权。
                </p>
                <div style="margin: 0 0 16px; padding: 12px; border: 1px dashed #ED1C24; border-radius: 6px; background: #fff7f7;">
                    <div style="font-size:12px; color:#666; margin-bottom:6px;">用户码</div>
                    <div id="trakt-device-user-code" style="font-size:28px; letter-spacing:4px; font-weight:700; color:#111;">${deviceData.user_code}</div>
                </div>
                <p id="trakt-auth-status" style="font-size:13px; color:#666; margin-bottom:18px;">
                    正在等待你在 Trakt 完成确认...
                </p>
                <div style="display:flex; gap:10px; justify-content:center; flex-wrap:wrap;">
                    <button id="trakt-auth-open" style="padding:8px 18px; cursor:pointer; background:#9F42C6; border:1px solid #9F42C6; border-radius:4px; color:#fff; font-size:14px;">打开验证页</button>
                    <button id="trakt-auth-cancel" style="padding:8px 18px; cursor:pointer; background:#eee; border:1px solid #ccc; border-radius:4px; color:#333; font-size:14px;">取消</button>
                </div>
                <p style="font-size:12px; color:#999; margin:16px 0 0; line-height:1.5;">
                    用户码约 ${Math.ceil((Number(deviceData.expires_in) || DEVICE_AUTH_TIMEOUT / 1000) / 60)} 分钟内有效。
                </p>
            `);

            const status = document.getElementById('trakt-auth-status');
            const openButton = document.getElementById('trakt-auth-open');
            const cancelButton = document.getElementById('trakt-auth-cancel');

            const setStatus = function (message) {
                if (status) {
                    status.textContent = message;
                }
            };

            if (openButton) {
                openButton.onclick = function () {
                    closePopupWindow(authWindow);
                    authWindow = window.open(verificationUrl, '_blank');
                };
            }

            if (cancelButton) {
                cancelButton.onclick = function () {
                    cancelled = true;
                    setStatus('已取消授权。');
                    closePopupWindow(authWindow);
                    removeModal(overlay);
                };
            }

            authWindow = window.open(verificationUrl, '_blank');

            const tokenData = await pollForDeviceToken(
                deviceData.device_code,
                deviceData.interval || (DEVICE_AUTH_FALLBACK_INTERVAL / 1000),
                deviceData.expires_in || (DEVICE_AUTH_TIMEOUT / 1000),
                setStatus,
                function () {
                    return cancelled;
                }
            );

            if (!tokenData || cancelled) return;
            if (!tokenData.access_token) {
                closePopupWindow(authWindow);
                removeModal(overlay);
                alert(`授权失败:\n${JSON.stringify(tokenData)}`);
                return;
            }

            setStatus('授权成功，正在刷新页面...');
            saveTraktTokens(tokenData);
            closePopupWindow(authWindow);
            removeModal(overlay);
            location.reload();
        } catch (error) {
            debugError('设备码授权失败', error);
            closePopupWindow(authWindow);
            removeModal(overlay);
            alert(error?.message || getDeviceAuthErrorMessage(error));
        }
    }

    function getImdbId() {
        const infoDiv = document.getElementById('info');
        if (!infoDiv) return null;

        const match = infoDiv.innerText.match(/IMDb:\s*(tt\d+)/);
        const imdbId = match ? match[1] : null;
        debugLog('IMDb 提取结果', { imdbId: imdbId });
        return imdbId;
    }

    function getDoubanSubjectId() {
        const match = location.pathname.match(/\/subject\/(\d+)/);
        const subjectId = match ? match[1] : '';
        debugLog('豆瓣条目 ID 提取结果', { subjectId: subjectId || null });
        return subjectId;
    }

    function parseImdbIdFromFrodoHtml(html) {
        if (!html) return null;

        const container = document.createElement('div');
        container.innerHTML = html;
        const rows = container.querySelectorAll('tr');

        for (const row of rows) {
            const cells = row.querySelectorAll('td');
            if (cells.length < 2) continue;

            const label = cells[0].innerText?.trim();
            const value = cells[1].innerText?.trim();
            if (label !== 'IMDb') continue;

            const match = value?.match(/tt\d+/);
            if (match) {
                debugLog('Frodo IMDb 提取结果', { imdbId: match[0] });
                return match[0];
            }
        }

        return null;
    }

    async function getMobileImdbId() {
        const subjectId = getDoubanSubjectId();
        if (!subjectId) return null;

        const url = `${DOUBAN_FRODO_API_URL}/${subjectId}/desc?apikey=${DOUBAN_FRODO_API_KEY}`;

        try {
            const data = await gmRequest({
                method: 'GET',
                url: url,
                headers: {
                    'User-Agent': 'MicroMessenger/8.0.0',
                    Referer: 'https://servicewechat.com/wx2f9b06c1de1ccfca'
                }
            });

            const imdbId = parseImdbIdFromFrodoHtml(data?.html);
            debugLog('移动端 Frodo 查询完成', {
                subjectId: subjectId,
                imdbId: imdbId || null
            });
            return imdbId;
        } catch (error) {
            debugError('移动端 Frodo 查询失败', error);
            return null;
        }
    }

    function cleanDoubanTitle(value) {
        if (!value) return '';

        return value
            .replace(/\s*\(豆瓣\)\s*$/i, '')
            .replace(/\s*-\s*(电影|电视剧)\s*-\s*豆瓣\s*$/i, '')
            .replace(/\s+/g, ' ')
            .trim();
    }

    function getDisplayTitle() {
        const title = cleanDoubanTitle(document.title);

        debugLog('标题提取结果', { title: title || null });
        return title || '';
    }

    function getReleaseYear() {
        const mobileOriginalTitle = document.querySelector('.sub-original-title')?.innerText?.trim();
        if (mobileOriginalTitle) {
            const mobileMatch = mobileOriginalTitle.match(/[（(](\d{4})[)）]/);
            if (mobileMatch) {
                debugLog('年份提取结果', { year: mobileMatch[1], source: mobileOriginalTitle });
                return mobileMatch[1];
            }
        }

        const pcYear = document.querySelector('h1>span.year')?.innerText?.trim();
        if (pcYear) {
            const pcMatch = pcYear.match(/[（(](\d{4})[)）]/);
            if (pcMatch) {
                debugLog('年份提取结果', { year: pcMatch[1], source: pcYear });
                return pcMatch[1];
            }
        }

        debugLog('年份提取结果', { year: null });
        return '';
    }

    function parseChineseSeasonNumber(value) {
        const numerals = {
            '一': 1,
            '二': 2,
            '三': 3,
            '四': 4,
            '五': 5,
            '六': 6,
            '七': 7,
            '八': 8,
            '九': 9,
            '十': 10
        };

        if (!value) return null;
        if (/^\d+$/.test(value)) return Number(value);
        if (numerals[value]) return numerals[value];
        const standardMatch = value.match(/^([一二三四五六七八九]?)(十)([一二三四五六七八九]?)$/);
        if (standardMatch) {
            const tens = standardMatch[1] ? numerals[standardMatch[1]] : 1;
            const ones = standardMatch[3] ? numerals[standardMatch[3]] : 0;
            return tens * 10 + ones;
        }

        return null;
    }

    function getSeasonNumber() {
        const normalizedTitle = cleanDoubanTitle(document.title);
        const seasonPatterns = [
            /第\s*([0-9一二三四五六七八九十]+)\s*季/i,
            /\bseason\s+(\d+)\b/i,
            /\bs(\d{1,2})\b/i
        ];

        for (const pattern of seasonPatterns) {
            const match = normalizedTitle.match(pattern);
            if (!match) continue;

            const seasonNumber = parseChineseSeasonNumber(match[1]);
            if (seasonNumber) {
                debugLog('季数提取结果', {
                    seasonNumber: seasonNumber,
                    source: normalizedTitle
                });
                return seasonNumber;
            }
        }

        debugLog('季数提取结果', {
            seasonNumber: null,
            source: normalizedTitle
        });
        return null;
    }

    function setButtonState(button, text, action, color, disabled) {
        const label = button.querySelector('span') || button;
        label.innerText = text;

        if (action) {
            button.dataset.action = action;
        } else {
            delete button.dataset.action;
        }

        const isDisabled = Boolean(disabled);
        button.dataset.disabled = isDisabled ? 'true' : 'false';
        button.setAttribute('aria-disabled', String(isDisabled));
        button.classList.toggle('is-disabled', isDisabled);

        if ('disabled' in button) {
            button.disabled = isDisabled;
        }

        if (color && button.tagName === 'BUTTON') {
            button.style.backgroundColor = color;
        }
    }

    function setOpenButtonState(button, url, disabled) {
        if (!button) return;

        button.dataset.traktUrl = url || '';
        button.dataset.disabled = disabled ? 'true' : 'false';
        button.setAttribute('aria-disabled', String(Boolean(disabled)));
        button.classList.toggle('is-disabled', Boolean(disabled));
    }

    function isMobileMarkButton(button) {
        return button.classList.contains('trakt-mark-btn');
    }

    function getWatchlistLabel(button, state) {
        const mobile = isMobileMarkButton(button);
        const labels = {
            connect: mobile ? '连接' : '连接',
            unavailable: mobile ? '不可用' : '不可用',
            noResource: mobile ? '无资源' : '无资源',
            add: mobile ? '+待看' : '+ 待看',
            remove: mobile ? '-移除' : '- 移除',
            loading: mobile ? '读取中' : '读取中...',
            matching: mobile ? '匹配中' : '匹配中...',
            syncing: mobile ? '同步中' : '同步中...'
        };

        return labels[state];
    }

    function clearAccessToken() {
        accessToken = '';
        refreshToken = '';
        tokenExpiresAt = 0;
        GM_setValue(ACCESS_TOKEN_KEY, '');
        GM_setValue(REFRESH_TOKEN_KEY, '');
        GM_setValue(TOKEN_EXPIRES_AT_KEY, 0);
    }

    function consumeButtonEvent(event) {
        if (!event) return;
        event.preventDefault();
        event.stopPropagation();
    }

    function stopButtonPropagation(event) {
        if (!event) return;
        event.stopPropagation();
    }

    function setButtonToConnect(button) {
        setButtonState(button, getWatchlistLabel(button, 'connect'), null, '#9F42C6', false);
        button.onclick = function (event) {
            consumeButtonEvent(event);
            authenticateTrakt().catch(function (error) {
                debugError('Trakt 授权流程失败', error);
            });
        };
    }

    function handleUnauthorized(button, requiresAuth) {
        if (!button) return;

        if (requiresAuth) {
            clearAccessToken();
            setButtonToConnect(button);
            return;
        }

        setButtonState(button, getWatchlistLabel(button, 'unavailable'), null, '#ccc', true);
    }

    function traktHeaders(includeAuth) {
        const headers = {
            'Content-Type': 'application/json',
            'trakt-api-version': '2',
            'trakt-api-key': TRAKT_CLIENT_ID
        };

        if (includeAuth) {
            headers.Authorization = `Bearer ${accessToken}`;
        }

        return headers;
    }

    function bindWatchlistButton(traktId, itemType, button) {
        if (!accessToken) {
            debugLog('未找到访问令牌，显示连接按钮');
            setButtonToConnect(button);
            return;
        }

        debugLog('已找到访问令牌，开始检查待看状态');
        button.dataset.itemType = itemType;
        button.onclick = async function (event) {
            consumeButtonEvent(event);
            if (button.dataset.disabled === 'true') return;
            try {
                await toggleTraktWatchlist(traktId, button.dataset.itemType, button.dataset.action, button);
            } catch (error) {
                debugError('切换待看状态失败', error);
            }
        };
        checkWatchlistStatus(traktId, button).catch(function (error) {
            debugError('检查待看状态失败', error);
        });
    }

    function applyTraktMatch(data, traktLink, button, openButton) {
        if (!data || data.length === 0) {
            debugLog('未找到 Trakt 匹配结果');
            if (traktLink) {
                traktLink.innerText = '无匹配结果';
                traktLink.href = '#';
            }
            setOpenButtonState(openButton, '', true);
            setButtonState(button, getWatchlistLabel(button, 'noResource'), null, '#ccc', true);
            return false;
        }

        const firstMatch = data[0];
        const itemType = firstMatch.type;
        const media = firstMatch[itemType];
        const traktId = media.ids.trakt;
        const slug = media.ids.slug || traktId;
        const seasonNumber = itemType === 'show' ? getSeasonNumber() : null;
        const traktUrl = seasonNumber
            ? `https://app.trakt.tv/${itemType}s/${slug}?season=${seasonNumber}`
            : `https://app.trakt.tv/${itemType}s/${slug}`;

        debugLog('Trakt 匹配结果已解析', {
            itemType: itemType,
            traktId: traktId,
            slug: slug,
            title: media.title,
            year: media.year,
            seasonNumber: seasonNumber
        });

        if (traktLink) {
            traktLink.innerText = String(traktId);
            traktLink.href = traktUrl;
        }
        setOpenButtonState(openButton, traktUrl, false);
        bindWatchlistButton(traktId, itemType, button);
        return true;
    }

    function showNoMatchState(traktLink, button, openButton) {
        if (traktLink) {
            traktLink.innerText = '无匹配结果';
            traktLink.href = '#';
        }
        setOpenButtonState(openButton, '', true);
        setButtonState(button, getWatchlistLabel(button, 'noResource'), null, '#ccc', true);
    }

    async function requestTraktByTmdbMatch(imdbId, tmdbId, tmdbType, traktLink, button, openButton) {
        const traktTmdbUrl = `${TRAKT_API_URL}/search/tmdb/${tmdbId}?type=${tmdbType}`;
        if (traktLink) traktLink.innerText = 'Trakt 回退匹配中...';
        setButtonState(button, getWatchlistLabel(button, 'matching'), null, '#ccc', true);
        setOpenButtonState(openButton, '', true);
        debugLog('TMDB 匹配成功，开始查询 Trakt', {
            imdbId: imdbId,
            tmdbId: tmdbId,
            tmdbType: tmdbType,
            traktTmdbUrl: traktTmdbUrl
        });

        try {
            const traktData = await gmRequest({
                method: 'GET',
                url: traktTmdbUrl,
                headers: traktHeaders(false)
            });

            debugLog('已收到 Trakt TMDB 回退响应', traktData);
            applyTraktMatch(traktData, traktLink, button, openButton);
        } catch (error) {
            debugError('Trakt TMDB 回退请求失败', error);
            if (traktLink) traktLink.innerText = error.status ? 'Trakt 查询失败' : '网络错误';
            setOpenButtonState(openButton, '', true);
            if (error.status === 401) {
                handleUnauthorized(button, false);
            }
        }
    }

    async function requestTmdbMatch(imdbId, traktLink, button, openButton) {
        const tmdbFindUrl = `${TMDB_API_URL}/3/find/${imdbId}?api_key=${TMDB_API_KEY}&external_source=imdb_id`;
        if (traktLink) traktLink.innerText = 'TMDB 查询中...';
        setButtonState(button, getWatchlistLabel(button, 'matching'), null, '#ccc', true);
        setOpenButtonState(openButton, '', true);
        debugLog('IMDb 无匹配，开始查询 TMDB', {
            imdbId: imdbId,
            tmdbFindUrl: tmdbFindUrl
        });

        try {
            const tmdbData = await gmRequest({
                method: 'GET',
                url: tmdbFindUrl,
                headers: {
                    'Content-Type': 'application/json'
                }
            });

            debugLog('已收到 TMDB 查询响应', tmdbData);

            const movie = tmdbData.movie_results?.[0];
            const show = tmdbData.tv_results?.[0];
            const episode = tmdbData.tv_episode_results?.[0];
            const tmdbType = movie ? 'movie' : show || episode ? 'show' : null;
            const tmdbId = movie?.id || show?.id || episode?.show_id || null;

            if (!tmdbType || !tmdbId) {
                debugLog('TMDB 未返回匹配结果', { imdbId: imdbId });
                showNoMatchState(traktLink, button, openButton);
                return;
            }

            await requestTraktByTmdbMatch(imdbId, tmdbId, tmdbType, traktLink, button, openButton);
        } catch (error) {
            debugError('TMDB 查询请求失败', error);
            if (traktLink) traktLink.innerText = error.status ? 'TMDB 查询失败' : '网络错误';
            setOpenButtonState(openButton, '', true);
            if (error.status === 401) {
                handleUnauthorized(button, false);
            }
        }
    }

    async function searchTraktByTmdbId(imdbId, traktLink, button, openButton) {
        await requestTmdbMatch(imdbId, traktLink, button, openButton);
    }

    async function checkWatchlistStatus(traktId, button) {
        debugLog('检查待看状态', { traktId: traktId });
        setButtonState(button, getWatchlistLabel(button, 'loading'), null, null, true);

        try {
            const watchlist = await gmRequest({
                method: 'GET',
                url: `${TRAKT_API_URL}/sync/watchlist?limit=2000`,
                headers: traktHeaders(true)
            });

            debugLog('已收到待看列表响应', watchlist);

            button.disabled = false;
            const isFound = watchlist.some((item) => {
                const media = item[item.type];
                return media && media.ids && media.ids.trakt === traktId;
            });

            debugLog('待看状态已解析', {
                traktId: traktId,
                inWatchlist: isFound
            });

            if (isFound) {
                setButtonState(button, getWatchlistLabel(button, 'remove'), 'remove', '#666', false);
            } else {
                setButtonState(button, getWatchlistLabel(button, 'add'), 'add', '#9F42C6', false);
            }
        } catch (error) {
            debugError('待看列表请求失败', error);
            if (error.status === 401) {
                handleUnauthorized(button, true);
                return;
            }

            button.disabled = false;
            setButtonState(button, getWatchlistLabel(button, 'add'), 'add', '#9F42C6', false);
        }
    }

    async function toggleTraktWatchlist(traktId, itemType, action, button) {
        debugLog('切换待看状态', {
            traktId: traktId,
            itemType: itemType,
            action: action
        });

        const isAdding = action === 'add';
        const endpoint = isAdding ? '/sync/watchlist' : '/sync/watchlist/remove';
        const payload = itemType === 'show'
            ? { shows: [{ ids: { trakt: traktId } }] }
            : { movies: [{ ids: { trakt: traktId } }] };

        debugLog('待看同步请求体已准备', payload);
        setButtonState(button, getWatchlistLabel(button, 'syncing'), action, null, true);

        try {
            const data = await gmRequest({
                method: 'POST',
                url: `${TRAKT_API_URL}${endpoint}`,
                headers: traktHeaders(true),
                data: JSON.stringify(payload)
            });

            debugLog('已收到待看同步响应', data);

            if (isAdding) {
                setButtonState(button, getWatchlistLabel(button, 'remove'), 'remove', '#666', false);
            } else {
                setButtonState(button, getWatchlistLabel(button, 'add'), 'add', '#9F42C6', false);
            }
        } catch (error) {
            debugError('待看同步请求失败', error);
            if (error.status === 401) {
                handleUnauthorized(button, true);
                alert('Trakt token 可能已过期，请重新授权。');
            } else if (error.status) {
                setButtonState(button, isAdding ? getWatchlistLabel(button, 'add') : getWatchlistLabel(button, 'remove'), action, isAdding ? '#9F42C6' : '#666', false);
                alert(`Trakt API 错误: ${error.status}\n${typeof error.data === 'string' ? error.data : JSON.stringify(error.data)}`);
            } else {
                setButtonState(button, isAdding ? getWatchlistLabel(button, 'add') : getWatchlistLabel(button, 'remove'), action, isAdding ? '#9F42C6' : '#666', false);
                alert('同步 Trakt 时发生网络错误。');
            }
        }
    }

    function buildImdbQueryUrl(imdbId) {
        if (!imdbId) return null;
        const queryUrl = `${TRAKT_API_URL}/search/imdb/${imdbId}?type=movie,show`;
        debugLog('使用 IMDb 精确搜索', { imdbId: imdbId, queryUrl: queryUrl });
        return queryUrl;
    }

    function buildTitleQueryUrl(traktLink, button) {
        const rawTitle = getDisplayTitle();
        const yearStr = getReleaseYear();

        debugLog('使用标题回退搜索', {
            rawTitle: rawTitle,
            year: yearStr
        });

        if (!rawTitle) {
            if (traktLink) traktLink.innerText = '无有效信息';
            setButtonState(button, getWatchlistLabel(button, 'unavailable'), null, '#ccc', true);
            return null;
        }

        if (traktLink) traktLink.innerText = '按名称搜索中...';
        setButtonState(button, getWatchlistLabel(button, 'matching'), null, '#ccc', true);
        const queryUrl = `${TRAKT_API_URL}/search/movie,show?query=${encodeURIComponent(rawTitle)}&years=${yearStr}`;
        debugLog('回退查询已准备', { queryUrl: queryUrl });
        return queryUrl;
    }

    function isMobilePage() {
        return location.hostname === 'm.douban.com';
    }

    function getMobileMarkSection() {
        return document.querySelector('section.subject-mark');
    }

    function waitForElement(getter, timeoutMs) {
        return new Promise(function (resolve) {
            const existing = getter();
            if (existing) {
                resolve(existing);
                return;
            }

            const observer = new MutationObserver(function () {
                const element = getter();
                if (!element) return;
                observer.disconnect();
                clearTimeout(timer);
                resolve(element);
            });

            const timer = setTimeout(function () {
                observer.disconnect();
                resolve(getter());
            }, timeoutMs);

            observer.observe(document.body, {
                childList: true,
                subtree: true
            });
        });
    }

    function getInjectionTarget() {
        return document.getElementById('info')
            || document.querySelector('.sub-detail')
            || document.querySelector('.subject-header-wrap .sub-info')
            || null;
    }

    function appendMetadataRow(container, traktLabel, traktMeta) {
        if (container.id === 'info') {
            container.appendChild(traktLabel);
            container.appendChild(traktMeta);
            return;
        }

        const row = document.createElement('div');
        row.className = 'trakt-mobile-row';
        row.appendChild(traktLabel);
        row.appendChild(traktMeta);
        container.appendChild(row);
    }

    function createMobileWatchlistButton() {
        const button = document.createElement('a');
        button.className = 'trakt-mark-btn';
        button.href = '#';
        button.rel = 'nofollow';
        button.innerHTML = '<i class="trakt-mark-icon"></i><span>读取中...</span>';
        button.addEventListener('touchstart', stopButtonPropagation, true);
        button.addEventListener('pointerdown', stopButtonPropagation, true);
        return button;
    }

    function createMobileOpenButton() {
        const button = document.createElement('a');
        button.className = 'trakt-open-btn';
        button.href = '#';
        button.rel = 'nofollow';
        button.innerHTML = '<span>Trakt</span>';
        setOpenButtonState(button, '', true);
        button.onclick = function (event) {
            consumeButtonEvent(event);
            if (button.dataset.disabled === 'true' || !button.dataset.traktUrl) return;
            window.open(button.dataset.traktUrl, '_blank');
        };
        button.addEventListener('touchstart', stopButtonPropagation, true);
        button.addEventListener('pointerdown', stopButtonPropagation, true);
        return button;
    }

    function createMobileScoreActions() {
        const wrapper = document.createElement('div');
        wrapper.className = 'trakt-mobile-actions';
        return wrapper;
    }

    async function init() {
        const mobilePage = isMobilePage();
        if (mobilePage) {
            injectMobileStyle();
        }

        debugLog('开始初始化页面集成', {
            title: document.title
        });

        let btn;
        let traktLink = null;
        let openBtn = null;

        if (mobilePage) {
            const markSection = await waitForElement(getMobileMarkSection, 5000);
            if (!markSection) {
                debugLog('未找到移动端按钮区容器，初始化终止');
                return;
            }

            btn = createMobileWatchlistButton();
            setButtonState(btn, getWatchlistLabel(btn, 'loading'), null, null, true);
            openBtn = createMobileOpenButton();
            const actions = createMobileScoreActions();
            actions.appendChild(openBtn);
            actions.appendChild(btn);
            markSection.parentNode.insertBefore(actions, markSection);
        } else {
            const injectionTarget = getInjectionTarget();
            if (!injectionTarget) {
                debugLog('未找到可注入容器，初始化终止');
                return;
            }

            const traktLabel = document.createElement('span');
            traktLabel.className = 'pl';
            traktLabel.innerText = 'Trakt: ';

            const traktMeta = document.createElement('span');
            traktMeta.className = 'trakt-meta-inline';
            traktMeta.style.whiteSpace = 'nowrap';
            appendMetadataRow(injectionTarget, traktLabel, traktMeta);

            btn = document.createElement('button');
            btn.className = 'trakt-watchlist-btn';
            btn.style.cssText = BTN_STYLE;
            btn.type = 'button';
            setButtonState(btn, getWatchlistLabel(btn, 'loading'), null, '#ccc', true);

            traktLink = document.createElement('a');
            traktLink.className = 'trakt-link';
            traktLink.target = '_blank';
            traktMeta.appendChild(traktLink);
            traktMeta.appendChild(btn);
        }

        const imdbId = mobilePage ? await getMobileImdbId() : getImdbId();
        const imdbQueryUrl = buildImdbQueryUrl(imdbId);
        if (imdbQueryUrl) {
            if (traktLink) traktLink.innerText = '精确匹配中...';
            setButtonState(btn, getWatchlistLabel(btn, 'matching'), null, '#ccc', true);

            try {
                const data = await gmRequest({
                    method: 'GET',
                    url: imdbQueryUrl,
                    headers: traktHeaders(false)
                });

                debugLog('已收到 IMDb 搜索响应', data);

                if (data && data.length > 0) {
                    applyTraktMatch(data, traktLink, btn, openBtn);
                    return;
                }
            } catch (error) {
                debugError('IMDb 搜索请求失败', error);
                if (traktLink) traktLink.innerText = error.status ? '查询失败' : '网络错误';
                setOpenButtonState(openBtn, '', true);
                if (error.status === 401) {
                    handleUnauthorized(btn, false);
                }
                if (error.status) return;
            }
        }

        const titleQueryUrl = buildTitleQueryUrl(traktLink, btn);
        if (!titleQueryUrl) return;

        try {
            const data = await gmRequest({
                method: 'GET',
                url: titleQueryUrl,
                headers: traktHeaders(false)
            });

            debugLog('已收到标题搜索响应', data);

            if (data && data.length > 0) {
                applyTraktMatch(data, traktLink, btn, openBtn);
                return;
            }

            if (imdbId) {
                await searchTraktByTmdbId(imdbId, traktLink, btn, openBtn);
                return;
            }

            applyTraktMatch(data, traktLink, btn, openBtn);
        } catch (error) {
            debugError('标题搜索请求失败', error);
            if (traktLink) traktLink.innerText = error.status ? '查询失败' : '网络错误';
            setOpenButtonState(openBtn, '', true);
            if (error.status === 401) {
                handleUnauthorized(btn, false);
            }
        }
    }

    window.addEventListener('load', function () {
        init().catch(function (error) {
            debugError('初始化失败', error);
        });
    });
})();
