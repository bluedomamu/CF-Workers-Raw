addEventListener('fetch', event => {
  event.respondWith(handleRequest(event.request))
})

// 配置
const config = {
  githubDomains: [
    'github.com',
    'api.github.com',
    'raw.githubusercontent.com',
    'gist.githubusercontent.com',
    'github.githubassets.com',
    'camo.githubusercontent.com',
    'avatars.githubusercontent.com',
    'avatars0.githubusercontent.com',
    'avatars1.githubusercontent.com',
    'avatars2.githubusercontent.com',
    'avatars3.githubusercontent.com'
  ],
  // 代理根路径显示搜索页面
  showSearchAtRoot: true
}

// 主请求处理函数
async function handleRequest(request) {
  const url = new URL(request.url)
  const proxyHost = url.hostname
  
  // 根路径显示搜索页面
  if (config.showSearchAtRoot && (url.pathname === '/' || url.pathname === '')) {
    return new Response(getSearchPage(), {
      headers: { 'Content-Type': 'text/html; charset=utf-8' }
    })
  }
  
  // 解析目标URL
  const targetUrl = getTargetUrl(url)
  if (!targetUrl) {
    return new Response('无效的请求地址', { status: 400 })
  }
  
  // 构建代理请求
  const proxyRequest = new Request(targetUrl, {
    method: request.method,
    headers: getProxyHeaders(request.headers, new URL(targetUrl)),
    body: request.body,
    redirect: 'manual'
  })
  
  // 发送请求并处理响应
  try {
    const response = await fetch(proxyRequest)
    return modifyResponse(response, proxyHost)
  } catch (e) {
    return new Response(`代理错误: ${e.message}`, { status: 500 })
  }
}

// 解析目标URL
function getTargetUrl(proxyUrl) {
  const path = proxyUrl.pathname.substring(1) // 移除开头的斜杠
  const search = proxyUrl.search
  
  // 如果路径已经包含GitHub域名，直接使用
  for (const domain of config.githubDomains) {
    if (path.startsWith(domain)) {
      return `https://${path}${search}`
    }
  }
  
  // 否则默认添加github.com前缀
  return `https://github.com/${path}${search}`
}

// 构建代理请求头
function getProxyHeaders(originalHeaders, targetUrl) {
  const headers = new Headers(originalHeaders)
  
  // 设置正确的Host头
  headers.set('Host', targetUrl.hostname)
  
  // 移除可能引起问题的头
  headers.delete('Origin')
  headers.delete('Referer')
  
  // 添加转发信息
  headers.set('X-Forwarded-For', originalHeaders.get('X-Forwarded-For') || '')
  headers.set('X-Forwarded-Host', originalHeaders.get('Host') || '')
  
  return headers
}

// 处理响应，重写链接
async function modifyResponse(response, proxyHost) {
  const contentType = response.headers.get('Content-Type') || ''
  const status = response.status
  
  // 处理重定向
  if ([301, 302, 307, 308].includes(status)) {
    const location = response.headers.get('Location')
    if (location) {
      const newLocation = rewriteUrl(location, proxyHost)
      const headers = new Headers(response.headers)
      headers.set('Location', newLocation)
      return new Response(response.body, { status, headers })
    }
  }
  
  // 处理HTML和CSS内容中的链接
  if (contentType.includes('text/html') || contentType.includes('text/css')) {
    let body = await response.text()
    body = rewriteHtml(body, proxyHost)
    
    const headers = new Headers(response.headers)
    // 移除安全策略限制
    headers.delete('Content-Security-Policy')
    headers.delete('Content-Security-Policy-Report-Only')
    headers.delete('X-XSS-Protection')
    // 更新内容长度
    headers.set('Content-Length', new TextEncoder().encode(body).length.toString())
    
    return new Response(body, { status, headers })
  }
  
  // 处理JavaScript文件
  if (contentType.includes('text/javascript') || contentType.includes('application/javascript')) {
    let body = await response.text()
    body = rewriteJs(body, proxyHost)
    
    const headers = new Headers(response.headers)
    headers.set('Content-Length', new TextEncoder().encode(body).length.toString())
    
    return new Response(body, { status, headers })
  }
  
  // 其他类型内容直接返回
  return response
}

// 重写URL为代理URL
function rewriteUrl(url, proxyHost) {
  if (!url) return url
  
  // 处理相对路径
  if (url.startsWith('/') && !url.startsWith('//')) {
    return `https://${proxyHost}${url}`
  }
  
  // 处理绝对路径
  for (const domain of config.githubDomains) {
    if (url.includes(domain)) {
      return url.replace(`https://${domain}`, `https://${proxyHost}`)
                .replace(`http://${domain}`, `https://${proxyHost}`)
                .replace(`//${domain}`, `//${proxyHost}`)
    }
  }
  
  return url
}

// 重写HTML内容中的链接
function rewriteHtml(html, proxyHost) {
  let result = html
  
  // 替换所有GitHub相关域名
  for (const domain of config.githubDomains) {
    // 替换带协议的URL
    result = result.replace(new RegExp(`https://${domain}`, 'g'), `https://${proxyHost}`)
    result = result.replace(new RegExp(`http://${domain}`, 'g'), `https://${proxyHost}`)
    // 替换相对协议的URL
    result = result.replace(new RegExp(`//${domain}`, 'g'), `//${proxyHost}`)
  }
  
  return result
}

// 重写JavaScript中的链接
function rewriteJs(js, proxyHost) {
  let result = js
  
  // 替换JavaScript中的GitHub域名
  for (const domain of config.githubDomains) {
    result = result.replace(new RegExp(`'https://${domain}'`, 'g'), `'https://${proxyHost}'`)
    result = result.replace(new RegExp(`"https://${domain}"`, 'g'), `"https://${proxyHost}"`)
  }
  
  return result
}

// 生成搜索页面HTML
function getSearchPage() {
  return `
  <!DOCTYPE html>
  <html lang="zh-CN">
  <head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>GitHub 搜索</title>
    <style>
      * {
        box-sizing: border-box;
        margin: 0;
        padding: 0;
      }
      body {
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
        line-height: 1.6;
        color: #24292e;
        background-color: #f6f8fa;
        padding: 20px;
      }
      .container {
        max-width: 1000px;
        margin: 0 auto;
        background-color: #fff;
        border-radius: 6px;
        box-shadow: 0 1px 3px rgba(0,0,0,0.12), 0 1px 2px rgba(0,0,0,0.24);
        padding: 30px;
      }
      h1 {
        text-align: center;
        margin-bottom: 30px;
        color: #24292e;
      }
      .search-form {
        display: flex;
        gap: 10px;
        margin-bottom: 30px;
      }
      @media (max-width: 768px) {
        .search-form {
          flex-direction: column;
        }
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
        background-color: #fff;
      }
      button {
        padding: 12px 20px;
        background-color: #2ea44f;
        color: white;
        border: none;
        border-radius: 6px;
        font-size: 16px;
        cursor: pointer;
        transition: background-color 0.2s;
      }
      button:hover {
        background-color: #2c974b;
      }
      .results {
        margin-top: 20px;
      }
      .result-item {
        padding: 15px 0;
        border-bottom: 1px solid #e1e4e8;
      }
      .result-item:last-child {
        border-bottom: none;
      }
      .result-title {
        font-size: 18px;
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
        margin-bottom: 8px;
        font-size: 14px;
      }
      .result-meta {
        color: #586069;
        font-size: 12px;
      }
      .status {
        padding: 20px;
        text-align: center;
        display: none;
      }
      .loading {
        color: #0366d6;
      }
      .error {
        color: #cb2431;
      }
    </style>
  </head>
  <body>
    <div class="container">
      <h1>GitHub 搜索</h1>
      <form class="search-form" id="search-form">
        <input type="text" id="search-input" placeholder="搜索仓库、用户或代码..." required>
        <select id="search-type">
          <option value="repositories">仓库</option>
          <option value="users">用户</option>
          <option value="code">代码</option>
        </select>
        <button type="submit">搜索</button>
      </form>
      
      <div class="status loading">搜索中...</div>
      <div class="status error"></div>
      <div class="results" id="results"></div>
    </div>
    
    <script>
      document.getElementById('search-form').addEventListener('submit', async function(e) {
        e.preventDefault();
        
        const query = document.getElementById('search-input').value.trim();
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
          const apiUrl = \`/api.github.com/search/\${type}?q=\${encodedQuery}&per_page=10\`;
          
          // 发送请求
          const response = await fetch(apiUrl);
          
          if (!response.ok) {
            throw new Error(\`搜索失败: \${response.status} \${response.statusText}\`);
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
                  <div class="result-description">\${item.description || '无描述'}</div>
                  <div class="result-meta">
                    <span>⭐ \${item.stargazers_count}</span> · 
                    <span>🍴 \${item.forks_count}</span> · 
                    <span>💻 \${item.language || '未知'}</span>
                  </div>
                \`;
              } else if (type === 'users') {
                resultItem.innerHTML = \`
                  <div class="result-title">
                    <a href="/\${item.login}">\${item.login}</a>
                  </div>
                  <div class="result-description">\${item.bio || '无简介'}</div>
                  <div class="result-meta">
                    <span>📦 \${item.public_repos} 个仓库</span> · 
                    <span>👥 \${item.followers} 个追随者</span>
                  </div>
                \`;
              } else if (type === 'code') {
                resultItem.innerHTML = \`
                  <div class="result-title">
                    <a href="/\${item.repository.full_name}/blob/\${item.path}">\${item.repository.full_name}/\${item.path}</a>
                  </div>
                  <div class="result-description">\${item.preview || ''}</div>
                  <div class="result-meta">
                    来自 <a href="/\${item.repository.full_name}">\${item.repository.full_name}</a>
                  </div>
                \`;
              }
              
              resultsDiv.appendChild(resultItem);
            });
          } else {
            resultsDiv.innerHTML = '<p>没有找到匹配的结果</p>';
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
}
    
