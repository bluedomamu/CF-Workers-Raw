addEventListener('fetch', event => {
  event.respondWith(handleRequest(event.request))
})

// 配置
const config = {
  githubDomain: 'github.com',
  apiDomain: 'api.github.com',
  rawDomain: 'raw.githubusercontent.com',
  gistDomain: 'gist.githubusercontent.com',
  cdnDomain: 'github.githubassets.com',
  // 可选：设置伪装页面，访问根目录时显示
  fakePage: 'https://example.com',
  // 启用搜索功能
  enableSearch: true
}

// 处理所有请求
async function handleRequest(request) {
  const url = new URL(request.url)
  const path = url.pathname

  // 根路径显示伪装页面或搜索页面
  if (path === '/' || path === '') {
    return config.enableSearch ? getSearchPage() : fetch(config.fakePage)
  }

  // 处理搜索请求
  if (config.enableSearch && path.startsWith('/search')) {
    return handleSearchRequest(request)
  }

  // 解析目标URL
  let targetUrl = await parseTargetUrl(request)
  if (!targetUrl) {
    return new Response('Invalid URL', { status: 400 })
  }

  // 构建代理请求
  const proxyRequest = new Request(targetUrl, {
    method: request.method,
    headers: modifyHeaders(request.headers, targetUrl),
    body: request.body,
    redirect: 'manual'
  })

  // 发送代理请求
  try {
    const response = await fetch(proxyRequest)
    return modifyResponse(response, url)
  } catch (e) {
    return new Response(`Proxy error: ${e.message}`, { status: 500 })
  }
}

// 解析目标URL
async function parseTargetUrl(request) {
  const url = new URL(request.url)
  let targetPath = url.pathname.substring(1) // 移除开头的斜杠
  
  // 处理不同类型的GitHub域名
  if (targetPath.startsWith(config.githubDomain) ||
      targetPath.startsWith(config.apiDomain) ||
      targetPath.startsWith(config.rawDomain) ||
      targetPath.startsWith(config.gistDomain) ||
      targetPath.startsWith(config.cdnDomain)) {
    return `https://${targetPath}${url.search}`
  }
  
  // 自动添加github.com前缀
  return `https://${config.githubDomain}/${targetPath}${url.search}`
}

// 修改请求头
function modifyHeaders(headers, targetUrl) {
  const newHeaders = new Headers(headers)
  const url = new URL(targetUrl)
  
  // 设置正确的Host头
  newHeaders.set('Host', url.hostname)
  
  // 移除可能导致问题的头
  newHeaders.delete('Referer')
  newHeaders.delete('Origin')
  
  return newHeaders
}

// 修改响应
async function modifyResponse(response, originalUrl) {
  const contentType = response.headers.get('Content-Type') || ''
  const originalHost = new URL(originalUrl).hostname
  
  // 处理重定向
  if (response.redirected || [301, 302, 307, 308].includes(response.status)) {
    const location = response.headers.get('Location')
    if (location) {
      const newLocation = rewriteUrl(location, originalHost)
      const newHeaders = new Headers(response.headers)
      newHeaders.set('Location', newLocation)
      return new Response(response.body, {
        status: response.status,
        statusText: response.statusText,
        headers: newHeaders
      })
    }
  }
  
  // 处理HTML内容，替换链接
  if (contentType.includes('text/html') || contentType.includes('text/css')) {
    const text = await response.text()
    const modifiedText = rewriteHtml(text, originalHost)
    const newHeaders = new Headers(response.headers)
    // 防止缓存问题
    newHeaders.delete('Content-Security-Policy')
    newHeaders.delete('Content-Security-Policy-Report-Only')
    newHeaders.delete('X-XSS-Protection')
    return new Response(modifiedText, {
      status: response.status,
      statusText: response.statusText,
      headers: newHeaders
    })
  }
  
  // 其他内容直接返回
  return response
}

// 重写URL
function rewriteUrl(url, proxyHost) {
  if (!url) return url
  
  // 处理相对路径
  if (url.startsWith('/') && !url.startsWith('//')) {
    return `https://${proxyHost}${url}`
  }
  
  // 处理绝对路径
  const githubDomains = [
    config.githubDomain,
    config.apiDomain,
    config.rawDomain,
    config.gistDomain,
    config.cdnDomain
  ]
  
  for (const domain of githubDomains) {
    if (url.includes(domain)) {
      return url.replace(`https://${domain}`, `https://${proxyHost}`)
                .replace(`http://${domain}`, `https://${proxyHost}`)
    }
  }
  
  return url
}

// 重写HTML内容中的链接
function rewriteHtml(html, proxyHost) {
  let modifiedHtml = html
  
  // 替换各种GitHub域名
  const githubDomains = [
    config.githubDomain,
    config.apiDomain,
    config.rawDomain,
    config.gistDomain,
    config.cdnDomain
  ]
  
  for (const domain of githubDomains) {
    modifiedHtml = modifiedHtml
      .replace(new RegExp(`https://${domain}`, 'g'), `https://${proxyHost}`)
      .replace(new RegExp(`http://${domain}`, 'g'), `https://${proxyHost}`)
      .replace(new RegExp(`//${domain}`, 'g'), `//${proxyHost}`)
  }
  
  // 处理JavaScript中的链接
  modifiedHtml = modifiedHtml.replace(/github\.com/g, proxyHost)
  
  return modifiedHtml
}

// 生成搜索页面
function getSearchPage() {
  const html = `
  <!DOCTYPE html>
  <html lang="en">
  <head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>GitHub Search</title>
    <style>
      body {
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
        max-width: 1200px;
        margin: 0 auto;
        padding: 20px;
        background-color: #f6f8fa;
      }
      .container {
        background-color: white;
        padding: 40px;
        border-radius: 6px;
        box-shadow: 0 1px 3px rgba(0,0,0,0.13);
      }
      h1 {
        color: #24292e;
        text-align: center;
        margin-bottom: 30px;
      }
      .search-form {
        display: flex;
        gap: 10px;
        margin-bottom: 30px;
      }
      #search-input {
        flex: 1;
        padding: 12px 15px;
        font-size: 16px;
        border: 1px solid #d1d5da;
        border-radius: 6px;
      }
      #search-type {
        padding: 12px 15px;
        font-size: 16px;
        border: 1px solid #d1d5da;
        border-radius: 6px;
        background-color: white;
      }
      button {
        padding: 12px 20px;
        background-color: #2ea44f;
        color: white;
        border: none;
        border-radius: 6px;
        font-size: 16px;
        cursor: pointer;
      }
      button:hover {
        background-color: #2c974b;
      }
      .results {
        margin-top: 30px;
      }
      .result-item {
        padding: 20px;
        border-bottom: 1px solid #eaecef;
      }
      .result-item:last-child {
        border-bottom: none;
      }
      .result-title {
        font-size: 20px;
        margin-bottom: 5px;
      }
      .result-title a {
        color: #0366d6;
        text-decoration: none;
      }
      .result-title a:hover {
        text-decoration: underline;
      }
      .result-description {
        color: #586069;
        margin-bottom: 10px;
      }
      .result-meta {
        color: #586069;
        font-size: 14px;
      }
      .loading {
        text-align: center;
        padding: 20px;
        display: none;
      }
      .error {
        color: #cb2431;
        padding: 20px;
        text-align: center;
        display: none;
      }
    </style>
  </head>
  <body>
    <div class="container">
      <h1>GitHub Search</h1>
      <form class="search-form" id="search-form">
        <input type="text" id="search-input" placeholder="Search repositories, users, or code..." required>
        <select id="search-type">
          <option value="repositories">Repositories</option>
          <option value="users">Users</option>
          <option value="code">Code</option>
        </select>
        <button type="submit">Search</button>
      </form>
      
      <div class="loading">Searching...</div>
      <div class="error"></div>
      <div class="results" id="results"></div>
    </div>
    
    <script>
      document.getElementById('search-form').addEventListener('submit', async function(e) {
        e.preventDefault();
        
        const query = document.getElementById('search-input').value;
        const type = document.getElementById('search-type').value;
        const resultsDiv = document.getElementById('results');
        const loadingDiv = document.querySelector('.loading');
        const errorDiv = document.querySelector('.error');
        
        // 重置状态
        resultsDiv.innerHTML = '';
        loadingDiv.style.display = 'block';
        errorDiv.style.display = 'none';
        
        try {
          // 构建API请求URL
          const encodedQuery = encodeURIComponent(query);
          const apiUrl = \`/api.${config.githubDomain}/search/\${type}?q=\${encodedQuery}&per_page=10\`;
          
          // 发送请求
          const response = await fetch(apiUrl);
          
          if (!response.ok) {
            throw new Error('Search failed: ' + response.statusText);
          }
          
          const data = await response.json();
          loadingDiv.style.display = 'none';
          
          // 显示结果
          if (data.items && data.items.length > 0) {
            data.items.forEach(item => {
              const resultItem = document.createElement('div');
              resultItem.className = 'result-item';
              
              if (type === 'repositories') {
                resultItem.innerHTML = \`
                  <div class="result-title">
                    <a href="/\${item.full_name}">\${item.name}</a>
                  </div>
                  <div class="result-description">\${item.description || ''}</div>
                  <div class="result-meta">
                    <span>Stars: \${item.stargazers_count}</span> · 
                    <span>Forks: \${item.forks_count}</span> · 
                    <span>Language: \${item.language || 'Unknown'}</span>
                  </div>
                \`;
              } else if (type === 'users') {
                resultItem.innerHTML = \`
                  <div class="result-title">
                    <a href="/\${item.login}">\${item.login}</a>
                  </div>
                  <div class="result-description">\${item.bio || ''}</div>
                  <div class="result-meta">
                    <span>Repositories: \${item.public_repos}</span> · 
                    <span>Followers: \${item.followers}</span>
                  </div>
                \`;
              } else if (type === 'code') {
                resultItem.innerHTML = \`
                  <div class="result-title">
                    <a href="/\${item.repository.full_name}/blob/\${item.path}">\${item.repository.full_name}/\${item.path}</a>
                  </div>
                  <div class="result-description">\${item.preview || ''}</div>
                  <div class="result-meta">
                    <span>Repository: <a href="/\${item.repository.full_name}">\${item.repository.full_name}</a></span>
                  </div>
                \`;
              }
              
              resultsDiv.appendChild(resultItem);
            });
          } else {
            resultsDiv.innerHTML = '<p>No results found.</p>';
          }
        } catch (error) {
          loadingDiv.style.display = 'none';
          errorDiv.style.display = 'block';
          errorDiv.textContent = error.message;
        }
      });
    </script>
  </body>
  </html>
  `;
  
  return new Response(html, {
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
    },
  });
}

// 处理搜索API请求
async function handleSearchRequest(request) {
  const url = new URL(request.url);
  const path = url.pathname;
  
  // 构建目标API URL
  const targetPath = path.replace('/search', `/search`);
  const targetUrl = `https://${config.apiDomain}${targetPath}${url.search}`;
  
  // 构建代理请求
  const proxyRequest = new Request(targetUrl, {
    method: request.method,
    headers: modifyHeaders(request.headers, targetUrl),
    body: request.body
  });
  
  try {
    const response = await fetch(proxyRequest);
    const newHeaders = new Headers(response.headers);
    
    // 添加CORS头
    newHeaders.set('Access-Control-Allow-Origin', '*');
    newHeaders.set('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    newHeaders.set('Access-Control-Allow-Headers', 'Content-Type');
    
    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers: newHeaders
    });
  } catch (e) {
    return new Response(`Search error: ${e.message}`, { status: 500 });
  }
}
