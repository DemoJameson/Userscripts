// ==UserScript==
// @name         豆瓣影视添加 Trakt 待看按钮
// @namespace    https://github.com/DemoJameson/Userscripts
// @version      1.1.0
// @description  在豆瓣电影和剧集页面添加 Trakt 待看按钮，并提供可切换的调试日志。
// @author       DemoJameson
// @updateURL    https://raw.githubusercontent.com/DemoJameson/Userscripts/main/douban-trakt.user.js
// @downloadURL  https://raw.githubusercontent.com/DemoJameson/Userscripts/main/douban-trakt.user.js
// @match        https://movie.douban.com/subject/*
// @grant        GM_xmlhttpRequest
// @grant        GM_setValue
// @grant        GM_getValue
// @grant        GM_registerMenuCommand
// @connect      api.trakt.tv
// @connect      api.tmdb.org
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

    const TRAKT_API_URL = 'https://api.trakt.tv';
    const TRAKT_CLIENT_ID = 'ae3b79dfd82d72aeab14337550d6762b9f161ddd5eea99e8ca1e2ddb0d484ecc';
    const TRAKT_CLIENT_SECRET = '045f13defe55c1562ef7df44a67d0762843649aadaf15b8314620f50051f5b46';
    const TMDB_API_URL = 'https://api.tmdb.org';
    const TMDB_API_KEY = 'ebb2c093078553178d5d75c6d86d7bde';
    const ACCESS_TOKEN_KEY = 'trakt_access_token';
    const DEBUG_KEY = 'trakt_debug_enabled';

    let accessToken = GM_getValue(ACCESS_TOKEN_KEY, '');
    let debugEnabled = GM_getValue(DEBUG_KEY, false);

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

    function showPinPrompt(callback) {
        debugLog('显示 PIN 输入框');

        const overlay = createModal(`
            <h3 style="margin-top:0; color:#ED1C24;">Trakt 授权认证</h3>
            <p style="font-size:14px; color:#333; margin-bottom:20px; line-height:1.5;">
                已在新标签页打开 Trakt 授权页面。<br>
                复制 PIN 码后，粘贴到这里。
            </p>
            <input
                type="text"
                id="trakt-pin-input"
                style="width:100%; padding:10px; border:1px solid #ccc; border-radius:4px; margin-bottom:20px; box-sizing:border-box; text-align:center; font-size:18px; letter-spacing:2px;"
                placeholder="输入 PIN 码"
            />
            <div>
                <button id="trakt-pin-cancel" style="padding:8px 20px; margin-right:10px; cursor:pointer; background:#eee; border:1px solid #ccc; border-radius:4px; color:#333; font-size:14px;">取消</button>
                <button id="trakt-pin-submit" style="padding:8px 20px; cursor:pointer; background:#ED1C24; color:#fff; border:none; border-radius:4px; font-size:14px; font-weight:bold;">提交 PIN 码</button>
            </div>
        `);

        const input = document.getElementById('trakt-pin-input');
        input.focus();

        document.getElementById('trakt-pin-submit').onclick = () => {
            const pin = input.value.trim();
            debugLog('已提交 PIN 输入框', { hasPin: Boolean(pin) });

            if (!pin) {
                alert('请输入有效的 PIN 码。');
                return;
            }

            document.body.removeChild(overlay);
            callback(pin);
        };

        document.getElementById('trakt-pin-cancel').onclick = () => {
            debugLog('已取消 PIN 输入框');
            document.body.removeChild(overlay);
            callback(null);
        };
    }

    function showPinPromptAsync() {
        return new Promise(function (resolve) {
            showPinPrompt(resolve);
        });
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

        if (response.status !== 200) {
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

        const authUrl = `https://trakt.tv/oauth/authorize?response_type=code&client_id=${TRAKT_CLIENT_ID}&redirect_uri=urn:ietf:wg:oauth:2.0:oob`;
        window.open(authUrl, '_blank');

        const pin = await showPinPromptAsync();
        if (!pin) return;

        try {
            const data = await gmRequest({
                method: 'POST',
                url: `${TRAKT_API_URL}/oauth/token`,
                headers: {
                    'Content-Type': 'application/json'
                },
                data: JSON.stringify({
                    code: pin,
                    client_id: TRAKT_CLIENT_ID,
                    client_secret: TRAKT_CLIENT_SECRET,
                    redirect_uri: 'urn:ietf:wg:oauth:2.0:oob',
                    grant_type: 'authorization_code'
                })
            });

            debugLog('已收到 OAuth token 响应', data);

            if (data && data.access_token) {
                GM_setValue(ACCESS_TOKEN_KEY, data.access_token);
                accessToken = data.access_token;
                alert('Trakt 授权成功，页面将刷新。');
                location.reload();
                return;
            }

            alert(`授权失败:\n${JSON.stringify(data)}`);
        } catch (error) {
            debugError('OAuth token 请求失败', error);
            if (error.status) {
                alert(`授权失败: ${error.status}\n${typeof error.data === 'string' ? error.data : JSON.stringify(error.data)}`);
            } else {
                alert('授权过程中发生网络错误。');
            }
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
        if (value === '十一') return 11;
        if (value === '十二') return 12;
        if (value.startsWith('十') && numerals[value.slice(1)]) {
            return 10 + numerals[value.slice(1)];
        }
        if (value.endsWith('十') && numerals[value[0]]) {
            return numerals[value[0]] * 10;
        }
        if (value.length === 2 && numerals[value[0]] && numerals[value[1]]) {
            return numerals[value[0]] * 10 + numerals[value[1]];
        }

        return null;
    }

    function getSeasonNumber() {
        const titleText = document.querySelector('h1')?.innerText || document.title || '';
        const normalizedTitle = titleText.replace(/\s+/g, ' ').trim();
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
        button.innerText = text;
        button.disabled = Boolean(disabled);
        if (action) button.dataset.action = action;
        if (color) button.style.backgroundColor = color;
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

    function bindWatchlistButton(traktId, button) {
        if (!accessToken) {
            debugLog('未找到访问令牌，显示连接按钮');
            setButtonState(button, '连接', null, '#9F42C6', false);
            button.onclick = function () {
                authenticateTrakt().catch(function (error) {
                    debugError('Trakt 授权流程失败', error);
                });
            };
            return;
        }

        debugLog('已找到访问令牌，开始检查待看状态');
        button.onclick = async function (event) {
            event.preventDefault();
            try {
                await toggleTraktWatchlist(traktId, button.dataset.action, button);
            } catch (error) {
                debugError('切换待看状态失败', error);
            }
        };
        checkWatchlistStatus(traktId, button).catch(function (error) {
            debugError('检查待看状态失败', error);
        });
    }

    function applyTraktMatch(data, traktLink, button, infoDiv) {
        if (!data || data.length === 0) {
            debugLog('未找到 Trakt 匹配结果');
            traktLink.innerText = '无匹配结果';
            traktLink.href = '#';
            setButtonState(button, '无资源', null, '#ccc', true);
            infoDiv.appendChild(button);
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

        traktLink.innerText = String(traktId);
        traktLink.href = traktUrl;
        infoDiv.appendChild(button);
        bindWatchlistButton(traktId, button);
        return true;
    }

    function showNoMatchState(traktLink, button, infoDiv) {
        traktLink.innerText = '无匹配结果';
        traktLink.href = '#';
        setButtonState(button, '无资源', null, '#ccc', true);
        infoDiv.appendChild(button);
    }

    async function requestTraktByTmdbMatch(imdbId, tmdbId, tmdbType, traktLink, button, infoDiv) {
        const traktTmdbUrl = `${TRAKT_API_URL}/search/tmdb/${tmdbId}?type=${tmdbType}`;
        traktLink.innerText = 'Trakt 回退匹配中...';
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
            applyTraktMatch(traktData, traktLink, button, infoDiv);
        } catch (error) {
            debugError('Trakt TMDB 回退请求失败', error);
            traktLink.innerText = error.status ? 'Trakt 查询失败' : '网络错误';
        }
    }

    async function requestTmdbMatch(imdbId, traktLink, button, infoDiv) {
        const tmdbFindUrl = `${TMDB_API_URL}/3/find/${imdbId}?api_key=${TMDB_API_KEY}&external_source=imdb_id`;
        traktLink.innerText = 'TMDB 查询中...';
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
                showNoMatchState(traktLink, button, infoDiv);
                return;
            }

            await requestTraktByTmdbMatch(imdbId, tmdbId, tmdbType, traktLink, button, infoDiv);
        } catch (error) {
            debugError('TMDB 查询请求失败', error);
            traktLink.innerText = error.status ? 'TMDB 查询失败' : '网络错误';
        }
    }

    async function searchTraktByTmdbId(imdbId, traktLink, button, infoDiv) {
        await requestTmdbMatch(imdbId, traktLink, button, infoDiv);
    }

    async function checkWatchlistStatus(traktId, button) {
        debugLog('检查待看状态', { traktId: traktId });
        setButtonState(button, '读取中...', null, null, true);

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
                setButtonState(button, '- 移除', 'remove', '#666', false);
            } else {
                setButtonState(button, '+ 待看', 'add', '#9F42C6', false);
            }
        } catch (error) {
            debugError('待看列表请求失败', error);
            button.disabled = false;
            setButtonState(button, '+ 待看', 'add', '#9F42C6', false);
        }
    }

    async function toggleTraktWatchlist(traktId, action, button) {
        debugLog('切换待看状态', {
            traktId: traktId,
            action: action
        });

        const isAdding = action === 'add';
        const endpoint = isAdding ? '/sync/watchlist' : '/sync/watchlist/remove';
        const payload = {
            movies: [{ ids: { trakt: traktId } }],
            shows: [{ ids: { trakt: traktId } }]
        };

        debugLog('待看同步请求体已准备', payload);
        setButtonState(button, '同步中...', action, null, true);

        try {
            const data = await gmRequest({
                method: 'POST',
                url: `${TRAKT_API_URL}${endpoint}`,
                headers: traktHeaders(true),
                data: JSON.stringify(payload)
            });

            debugLog('已收到待看同步响应', data);

            if (isAdding) {
                setButtonState(button, '- 移除', 'remove', '#666', false);
            } else {
                setButtonState(button, '+ 待看', 'add', '#9F42C6', false);
            }
        } catch (error) {
            debugError('待看同步请求失败', error);
            setButtonState(button, isAdding ? '+ 待看' : '- 移除', action, isAdding ? '#9F42C6' : '#666', false);
            if (error.status === 401) {
                alert('Trakt token 可能已过期，请重新授权。');
            } else if (error.status) {
                alert(`Trakt API 错误: ${error.status}\n${typeof error.data === 'string' ? error.data : JSON.stringify(error.data)}`);
            } else {
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

    function buildTitleQueryUrl(traktLink, button, infoDiv) {
        const rawTitle = document.title.replace(' (豆瓣)', '');
        const yearStr = (document.querySelector('h1 span.year')?.innerText || '').replace(/[()]/g, '').trim();

        debugLog('使用标题回退搜索', {
            rawTitle: rawTitle,
            year: yearStr
        });

        if (!rawTitle) {
            traktLink.innerText = '无有效信息';
            setButtonState(button, '不可用', null, '#ccc', true);
            infoDiv.appendChild(button);
            return null;
        }

        traktLink.innerText = '按名称搜索中...';
        const queryUrl = `${TRAKT_API_URL}/search/movie,show?query=${encodeURIComponent(rawTitle)}&years=${yearStr}`;
        debugLog('回退查询已准备', { queryUrl: queryUrl });
        return queryUrl;
    }

    async function init() {
        const infoDiv = document.getElementById('info');
        if (!infoDiv) {
            debugLog('未找到 #info，初始化终止');
            return;
        }

        debugLog('开始初始化页面集成', {
            title: document.title
        });

        const traktLabel = document.createElement('span');
        traktLabel.className = 'pl';
        traktLabel.innerText = 'Trakt: ';
        infoDiv.appendChild(traktLabel);

        const btn = document.createElement('button');
        btn.style.cssText = BTN_STYLE;
        btn.type = 'button';

        const traktLink = document.createElement('a');
        traktLink.target = '_blank';
        infoDiv.appendChild(traktLink);

        const imdbId = getImdbId();
        const imdbQueryUrl = buildImdbQueryUrl(imdbId);
        if (imdbQueryUrl) {
            traktLink.innerText = '精确匹配中...';

            try {
                const data = await gmRequest({
                    method: 'GET',
                    url: imdbQueryUrl,
                    headers: traktHeaders(false)
                });

                debugLog('已收到 IMDb 搜索响应', data);

                if (data && data.length > 0) {
                    applyTraktMatch(data, traktLink, btn, infoDiv);
                    return;
                }
            } catch (error) {
                debugError('IMDb 搜索请求失败', error);
                traktLink.innerText = error.status ? '查询失败' : '网络错误';
                if (error.status) return;
            }
        }

        const titleQueryUrl = buildTitleQueryUrl(traktLink, btn, infoDiv);
        if (!titleQueryUrl) return;

        try {
            const data = await gmRequest({
                method: 'GET',
                url: titleQueryUrl,
                headers: traktHeaders(false)
            });

            debugLog('已收到标题搜索响应', data);

            if (data && data.length > 0) {
                applyTraktMatch(data, traktLink, btn, infoDiv);
                return;
            }

            if (imdbId) {
                await searchTraktByTmdbId(imdbId, traktLink, btn, infoDiv);
                return;
            }

            applyTraktMatch(data, traktLink, btn, infoDiv);
        } catch (error) {
            debugError('标题搜索请求失败', error);
            traktLink.innerText = error.status ? '查询失败' : '网络错误';
        }
    }

    window.addEventListener('load', function () {
        init().catch(function (error) {
            debugError('初始化失败', error);
        });
    });
})();
