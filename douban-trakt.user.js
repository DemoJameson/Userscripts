// ==UserScript==
// @name         豆瓣影视添加 Trakt 待看按钮
// @namespace    http://tampermonkey.net/
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

    const API_URL = 'https://api.trakt.tv';
    const CLIENT_ID = 'ae3b79dfd82d72aeab14337550d6762b9f161ddd5eea99e8ca1e2ddb0d484ecc';
    const CLIENT_SECRET = '045f13defe55c1562ef7df44a67d0762843649aadaf15b8314620f50051f5b46';
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

    function authenticateTrakt() {
        debugLog('开始 Trakt 授权', {
            hasClientId: Boolean(CLIENT_ID),
            hasClientSecret: Boolean(CLIENT_SECRET)
        });

        if (!CLIENT_ID || !CLIENT_SECRET) {
            alert('脚本中未找到 Trakt Client ID 或 Secret，请检查代码。');
            return;
        }

        const authUrl = `https://trakt.tv/oauth/authorize?response_type=code&client_id=${CLIENT_ID}&redirect_uri=urn:ietf:wg:oauth:2.0:oob`;
        window.open(authUrl, '_blank');

        showPinPrompt(function (pin) {
            if (!pin) return;

            GM_xmlhttpRequest({
                method: 'POST',
                url: `${API_URL}/oauth/token`,
                headers: {
                    'Content-Type': 'application/json'
                },
                data: JSON.stringify({
                    code: pin,
                    client_id: CLIENT_ID,
                    client_secret: CLIENT_SECRET,
                    redirect_uri: 'urn:ietf:wg:oauth:2.0:oob',
                    grant_type: 'authorization_code'
                }),
                onload: function (response) {
                    debugLog('已收到 OAuth token 响应', {
                        status: response.status,
                        response: response
                    });

                    try {
                        const data = JSON.parse(response.responseText);
                        if (data.access_token) {
                            GM_setValue(ACCESS_TOKEN_KEY, data.access_token);
                            accessToken = data.access_token;
                            alert('Trakt 授权成功，页面将刷新。');
                            location.reload();
                            return;
                        }

                        alert(`授权失败:\n${response.responseText}`);
                    } catch (error) {
                        debugError('解析 OAuth token 响应失败', error);
                        alert('解析 Trakt Token 响应时出错。');
                    }
                },
                onerror: function (error) {
                    debugError('OAuth token 请求失败', error);
                    alert('授权过程中发生网络错误。');
                }
            });
        });
    }

    function getImdbId() {
        const infoDiv = document.getElementById('info');
        if (!infoDiv) return null;

        const match = infoDiv.innerText.match(/IMDb:\s*(tt\d+)/);
        const imdbId = match ? match[1] : null;
        debugLog('IMDb 提取结果', { imdbId: imdbId });
        return imdbId;
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
            'trakt-api-key': CLIENT_ID
        };

        if (includeAuth) {
            headers.Authorization = `Bearer ${accessToken}`;
        }

        return headers;
    }

    function checkWatchlistStatus(traktId, button) {
        debugLog('检查待看状态', { traktId: traktId });
        setButtonState(button, '读取中...', null, null, true);

        GM_xmlhttpRequest({
            method: 'GET',
            url: `${API_URL}/sync/watchlist?limit=2000`,
            headers: traktHeaders(true),
            onload: function (response) {
                debugLog('已收到待看列表响应', {
                    status: response.status,
                    response: response
                });

                button.disabled = false;

                if (response.status !== 200) {
                    setButtonState(button, '+ 待看', 'add', '#9F42C6', false);
                    return;
                }

                try {
                    const watchlist = JSON.parse(response.responseText);
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
                    debugError('解析待看列表响应失败', error);
                    setButtonState(button, '+ 待看', 'add', '#9F42C6', false);
                }
            },
            onerror: function (error) {
                debugError('待看列表请求失败', error);
                setButtonState(button, '+ 待看', 'add', '#9F42C6', false);
            }
        });
    }

    function toggleTraktWatchlist(traktId, action, button) {
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

        GM_xmlhttpRequest({
            method: 'POST',
            url: `${API_URL}${endpoint}`,
            headers: traktHeaders(true),
            data: JSON.stringify(payload),
            onload: function (response) {
                debugLog('已收到待看同步响应', {
                    status: response.status,
                    response: response
                });

                if (response.status === 200 || response.status === 201) {
                    if (isAdding) {
                        setButtonState(button, '- 移除', 'remove', '#666', false);
                    } else {
                        setButtonState(button, '+ 待看', 'add', '#9F42C6', false);
                    }
                    return;
                }

                if (response.status === 401) {
                    alert('Trakt token 可能已过期，请重新授权。');
                } else {
                    alert(`Trakt API 错误: ${response.status}\n${response.responseText}`);
                }

                setButtonState(button, isAdding ? '+ 待看' : '- 移除', action, isAdding ? '#9F42C6' : '#666', false);
            },
            onerror: function (error) {
                debugError('待看同步请求失败', error);
                setButtonState(button, isAdding ? '+ 待看' : '- 移除', action, isAdding ? '#9F42C6' : '#666', false);
                alert('同步 Trakt 时发生网络错误。');
            }
        });
    }

    function resolveQueryUrl(traktLink, button, infoDiv) {
        const imdbId = getImdbId();
        if (imdbId) {
            traktLink.innerText = '精确匹配中...';
            const queryUrl = `${API_URL}/search/imdb/${imdbId}?type=movie,show`;
            debugLog('使用 IMDb 精确搜索', { imdbId: imdbId, queryUrl: queryUrl });
            return queryUrl;
        }

        const rawTitle = document.querySelector('h1 span[property="v:itemreviewed"]')?.innerText || document.title.replace(' (豆瓣)', '');
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
        const queryUrl = `${API_URL}/search/movie,show?query=${encodeURIComponent(rawTitle)}&years=${yearStr}`;
        debugLog('回退查询已准备', { queryUrl: queryUrl });
        return queryUrl;
    }

    function init() {
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

        const queryUrl = resolveQueryUrl(traktLink, btn, infoDiv);
        if (!queryUrl) return;

        GM_xmlhttpRequest({
            method: 'GET',
            url: queryUrl,
            headers: traktHeaders(false),
            onload: function (response) {
                debugLog('已收到搜索响应', {
                    status: response.status,
                    response: response
                });

                if (response.status !== 200) {
                    traktLink.innerText = '查询失败';
                    return;
                }

                try {
                    const data = JSON.parse(response.responseText);
                    if (!data || data.length === 0) {
                        debugLog('未找到 Trakt 匹配结果');
                        traktLink.innerText = '无匹配结果';
                        traktLink.href = '#';
                        setButtonState(btn, '无资源', null, '#ccc', true);
                        infoDiv.appendChild(btn);
                        return;
                    }

                    const firstMatch = data[0];
                    const itemType = firstMatch.type;
                    const media = firstMatch[itemType];
                    const traktId = media.ids.trakt;
                    const slug = media.ids.slug || traktId;

                    debugLog('Trakt 匹配结果已解析', {
                        itemType: itemType,
                        traktId: traktId,
                        slug: slug,
                        title: media.title,
                        year: media.year
                    });

                    traktLink.innerText = String(traktId);
                    traktLink.href = `https://trakt.tv/${itemType}s/${slug}`;
                    infoDiv.appendChild(btn);

                    if (!accessToken) {
                        debugLog('未找到访问令牌，显示连接按钮');
                        setButtonState(btn, '连接', null, '#9F42C6', false);
                        btn.onclick = authenticateTrakt;
                        return;
                    }

                    debugLog('已找到访问令牌，开始检查待看状态');
                    btn.onclick = function (event) {
                        event.preventDefault();
                        toggleTraktWatchlist(traktId, btn.dataset.action, btn);
                    };
                    checkWatchlistStatus(traktId, btn);
                } catch (error) {
                    debugError('解析搜索响应失败', error);
                    traktLink.innerText = '解析错误';
                }
            },
            onerror: function (error) {
                debugError('搜索请求失败', error);
                traktLink.innerText = '网络错误';
            }
        });
    }

    window.addEventListener('load', init);
})();
