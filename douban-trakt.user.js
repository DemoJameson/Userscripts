// ==UserScript==
// @name         豆瓣影视添加 Trakt 待看按钮
// @namespace    http://tampermonkey.net/
// @version      1.0
// @description  在豆瓣影视页面添加 Trakt 待看按钮。
// @author       DemoJameson
// @updateURL    https://raw.githubusercontent.com/DemoJameson/Userscripts/main/douban-trakt.user.js
// @downloadURL  https://raw.githubusercontent.com/DemoJameson/Userscripts/main/douban-trakt.user.js
// @match        https://movie.douban.com/subject/*
// @grant        GM_xmlhttpRequest
// @grant        GM_setValue
// @grant        GM_getValue
// @connect      api.trakt.tv
// ==/UserScript==

(function () {
    'use strict';

    // UI Configuration
    const BTN_STYLE = `
        display: inline-block;
        padding: 2px 8px;
        margin-left: 8px;
        background-color: #9F42C6; /* Trakt Purple */
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

    // API Configuration
    const API_URL = 'https://api.trakt.tv';
    let CLIENT_ID = 'ae3b79dfd82d72aeab14337550d6762b9f161ddd5eea99e8ca1e2ddb0d484ecc';
    let CLIENT_SECRET = '045f13defe55c1562ef7df44a67d0762843649aadaf15b8314620f50051f5b46';
    let ACCESS_TOKEN = GM_getValue('trakt_access_token', '');

    // Show a custom modal for PIN input to prevent tab-switching dismissal
    function showPinPrompt(callback) {
        const overlay = document.createElement('div');
        overlay.style.cssText = `
            position: fixed; top: 0; left: 0; width: 100vw; height: 100vh;
            background: rgba(0,0,0,0.6); z-index: 999999;
            display: flex; align-items: center; justify-content: center;
        `;

        const modal = document.createElement('div');
        modal.style.cssText = `
            background: #fff; padding: 25px; border-radius: 8px;
            width: 400px; max-width: 90%; text-align: center;
            box-shadow: 0 4px 15px rgba(0,0,0,0.2); font-family: sans-serif;
        `;

        modal.innerHTML = `
            <h3 style="margin-top:0; color:#ED1C24;">Trakt 授权认证</h3>
            <p style="font-size:14px; color:#333; margin-bottom:20px; line-height:1.5;">
                已为您在新标签页打开授权页面。<br>
                获取 PIN 码后，请粘贴在下方：
            </p>
            <input type="text" id="trakt-pin-input" style="width:100%; padding:10px; border:1px solid #ccc; border-radius:4px; margin-bottom:20px; box-sizing:border-box; text-align:center; font-size:18px; letter-spacing:2px;" placeholder="在此输入 PIN 码" />
            <div>
                <button id="trakt-pin-cancel" style="padding:8px 20px; margin-right:10px; cursor:pointer; background:#eee; border:1px solid #ccc; border-radius:4px; color:#333; font-size:14px;">取消</button>
                <button id="trakt-pin-submit" style="padding:8px 20px; cursor:pointer; background:#ED1C24; color:#fff; border:none; border-radius:4px; font-size:14px; font-weight:bold;">提交 PIN 码</button>
            </div>
        `;

        overlay.appendChild(modal);
        document.body.appendChild(overlay);

        const input = document.getElementById('trakt-pin-input');
        input.focus();

        document.getElementById('trakt-pin-submit').onclick = () => {
            const pin = input.value.trim();
            if (pin) {
                document.body.removeChild(overlay);
                callback(pin);
            } else {
                alert("请输入有效的 PIN 码。");
            }
        };

        document.getElementById('trakt-pin-cancel').onclick = () => {
            document.body.removeChild(overlay);
            callback(null);
        };
    }

    // Authenticate with Trakt and fetch Access/Refresh tokens
    function authenticateTrakt() {
        if (!CLIENT_ID || !CLIENT_SECRET) {
            alert("脚本中未找到 Trakt Client ID 和 Secret，请检查代码。");
            return;
        }

        const authUrl = `https://trakt.tv/oauth/authorize?response_type=code&client_id=${CLIENT_ID}&redirect_uri=urn:ietf:wg:oauth:2.0:oob`;
        window.open(authUrl, '_blank');

        showPinPrompt(function (pin) {
            if (!pin) return;

            GM_xmlhttpRequest({
                method: "POST",
                url: `${API_URL}/oauth/token`,
                headers: {
                    "Content-Type": "application/json"
                },
                data: JSON.stringify({
                    code: pin,
                    client_id: CLIENT_ID,
                    client_secret: CLIENT_SECRET,
                    redirect_uri: "urn:ietf:wg:oauth:2.0:oob",
                    grant_type: "authorization_code"
                }),
                onload: function (response) {
                    try {
                        const data = JSON.parse(response.responseText);
                        if (data.access_token) {
                            GM_setValue('trakt_access_token', data.access_token);
                            ACCESS_TOKEN = data.access_token;
                            alert("成功验证 Trakt 授权！页面即将刷新。");
                            location.reload();
                        } else {
                            alert("验证失败：\n" + response.responseText);
                        }
                    } catch (e) {
                        alert("解析 Trakt API 的 Token 响应时出错。");
                    }
                },
                onerror: function (err) {
                    alert("授权过程中发生网络错误。");
                }
            });
        });
    }

    // Attempt to extract the robust IMDb ID from the Douban #info element
    function getImdbId() {
        const infoDiv = document.getElementById('info');
        if (!infoDiv) return null;

        // Matches typical Douban HTML formatting like 'IMDb: tt1234567' or link texts
        const match = infoDiv.innerText.match(/IMDb:\s*(tt\d+)/);
        return match ? match[1] : null;
    }

    // Check if the current Trakt ID is already in the Trakt watchlist
    function checkWatchlistStatus(traktId, button) {
        button.innerText = "读取中...";
        button.disabled = true;

        GM_xmlhttpRequest({
            method: "GET",
            // Trakt paginates, setting a high limit will fetch most users' entire watchlist in one go
            url: `${API_URL}/sync/watchlist?limit=2000`,
            headers: {
                "Content-Type": "application/json",
                "Authorization": `Bearer ${ACCESS_TOKEN}`,
                "trakt-api-version": "2",
                "trakt-api-key": CLIENT_ID
            },
            onload: function (response) {
                button.disabled = false;
                if (response.status === 200) {
                    try {
                        const watchlist = JSON.parse(response.responseText);
                        let isFound = false;
                        for (let item of watchlist) {
                            const media = item[item.type]; // usually 'movie' or 'show'
                            if (media && media.ids && media.ids.trakt === traktId) {
                                isFound = true;
                                break;
                            }
                        }

                        if (isFound) {
                            button.innerText = "- 移除";
                            button.dataset.action = 'remove';
                            button.style.backgroundColor = '#666'; // Gray
                        } else {
                            button.innerText = "+ 待看";
                            button.dataset.action = 'add';
                            button.style.backgroundColor = '#9F42C6'; // Purple
                        }
                    } catch (e) {
                        button.innerText = "+ 待看";
                        button.dataset.action = 'add';
                        console.error("Error parsing Trakt watchlist:", e);
                    }
                } else {
                    button.innerText = "+ 待看";
                    button.dataset.action = 'add';
                }
            },
            onerror: function (err) {
                button.disabled = false;
                button.innerText = "+ 待看";
                button.dataset.action = 'add';
                console.error("Network error fetching watchlist.");
            }
        });
    }

    // Toggle Add/Remove to/from Trakt watchlist
    function toggleTraktWatchlist(traktId, action, button) {
        button.innerText = "同步中...";
        button.disabled = true;

        // Determine if we're adding or removing
        const isAdding = (action === 'add');
        const endpoint = isAdding ? '/sync/watchlist' : '/sync/watchlist/remove';

        // Use the resolved native Trakt ID for the synchronization action
        const payload = {
            movies: [{ ids: { trakt: traktId } }],
            shows: [{ ids: { trakt: traktId } }]
        };

        GM_xmlhttpRequest({
            method: "POST",
            url: `${API_URL}${endpoint}`,
            headers: {
                "Content-Type": "application/json",
                "Authorization": `Bearer ${ACCESS_TOKEN}`,
                "trakt-api-version": "2",
                "trakt-api-key": CLIENT_ID
            },
            data: JSON.stringify(payload),
            onload: function (response) {
                button.disabled = false;

                // Trakt returns 200 or 201 for POST /sync/watchlist requests
                if (response.status === 200 || response.status === 201) {
                    if (isAdding) {
                        button.innerText = "- 移除";
                        button.dataset.action = 'remove';
                        button.style.backgroundColor = '#666'; // Gray for remove state
                    } else {
                        button.innerText = "+ 待看";
                        button.dataset.action = 'add';
                        button.style.backgroundColor = '#9F42C6'; // Purple for add state
                    }
                } else {
                    // Unauthorized handling
                    if (response.status === 401) {
                        alert("您的 Trakt token 可能已过期。如果问题持续，请清除它或从菜单重新认证。");
                    } else {
                        alert("Trakt API 错误: " + response.status + "\n" + response.responseText);
                    }
                    button.innerText = isAdding ? "+ 待看" : "- 移除";
                }
            },
            onerror: function (err) {
                button.disabled = false;
                button.innerText = isAdding ? "+ 待看" : "- 移除";
                alert("同步 Trakt 时发生网络错误。");
            }
        });
    }

    // Inject the button onto the page upon window load (to ensure #info and title exist)
    function init() {
        const infoDiv = document.getElementById('info');
        if (!infoDiv) return;

        const traktLabel = document.createElement('span');
        traktLabel.className = 'pl';
        traktLabel.innerText = 'Trakt: ';
        infoDiv.appendChild(traktLabel);

        const btn = document.createElement('button');
        btn.style.cssText = BTN_STYLE;
        btn.type = "button";

        const traktLink = document.createElement('a');
        traktLink.target = '_blank';
        infoDiv.appendChild(traktLink);

        const imdbId = getImdbId();
        let queryUrl = null;

        if (imdbId) {
            traktLink.innerText = "精准匹配中...";
            queryUrl = `${API_URL}/search/imdb/${imdbId}?type=movie,show`;
        } else {
            // Fallback: search by Douban movie name and year
            const rawTitle = document.querySelector('h1 span[property="v:itemreviewed"]')?.innerText || document.title.replace(' (豆瓣)', '');
            const yearStr = (document.querySelector('h1 span.year')?.innerText || '').replace(/[()]/g, '').trim();

            if (rawTitle) {
                traktLink.innerText = "按名称搜索中...";
                queryUrl = `${API_URL}/search/movie,show?query=${encodeURIComponent(rawTitle)}&years=${yearStr}`;
            } else {
                traktLink.innerText = "无有效信息";
                btn.innerText = "不可用";
                btn.disabled = true;
                btn.style.backgroundColor = '#ccc';
                infoDiv.appendChild(btn);
                return;
            }
        }

        // Fetch Trakt ID dynamically via Trakt API Search
        GM_xmlhttpRequest({
            method: "GET",
            url: queryUrl,
            headers: {
                "Content-Type": "application/json",
                "trakt-api-version": "2",
                "trakt-api-key": CLIENT_ID
            },
            onload: function (response) {
                if (response.status === 200) {
                    try {
                        const data = JSON.parse(response.responseText);
                        if (data && data.length > 0) {
                            // Extract item type accurately (works for both text search and imdb id search JSON schema)
                            const firstMatch = data[0];
                            const itemType = firstMatch.type;
                            const media = firstMatch[itemType];
                            const traktId = media.ids.trakt;
                            const slug = media.ids.slug || traktId;

                            traktLink.innerText = traktId;
                            traktLink.href = `https://trakt.tv/${itemType}s/${slug}`;

                            infoDiv.appendChild(btn);

                            // Initialize the action logic using the found Trakt ID
                            if (!ACCESS_TOKEN) {
                                btn.innerText = "连接";
                                btn.onclick = authenticateTrakt;
                            } else {
                                btn.onclick = function (e) {
                                    e.preventDefault();
                                    toggleTraktWatchlist(traktId, btn.dataset.action, btn);
                                };
                                // Check real status on load
                                checkWatchlistStatus(traktId, btn);
                            }
                        } else {
                            traktLink.innerText = "无匹配结果";
                            traktLink.href = "javascript:void(0);";
                            btn.innerText = "无资源";
                            btn.disabled = true;
                            btn.style.backgroundColor = '#ccc';
                            infoDiv.appendChild(btn);
                        }
                    } catch (e) {
                        traktLink.innerText = "解析错误";
                    }
                } else {
                    traktLink.innerText = "查询失败";
                }
            },
            onerror: function () {
                traktLink.innerText = "网络错误";
            }
        });
    }

    // Wait for the full DOM tree so douban's #info container is populated
    window.addEventListener('load', init);

})();
