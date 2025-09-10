export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const path = url.pathname;

    // 1. 根路径直接302跳转到GitHub官方搜索页
    if (path === '/') {
      return Response.redirect('https://github.com/search', 302);
    }

    // 2. 处理搜索请求（/search 路径）
    if (path.startsWith('/search')) {
      return handleSearchRequest(request);
    }

    // 3. 处理API代理（仓库、Issue、Release等数据）
    if (path.startsWith('/api/')) {
      return handleApiProxy(request);
    }

    // 4. 处理内容浏览（代码查看、仓库目录等）
    return handleContentBrowse(request);
  }
};

/**
 * 处理搜索请求（代理GitHub Search API）
 */
async function handleSearchRequest(request) {
  const url = new URL(request.url);
  const searchType = url.searchParams.get('type') || 'repositories';
  const keyword = url.searchParams.get('q');

  // 校验参数
  if (!keyword) {
    return new Response('搜索关键词不能为空', { status: 400 });
  }

  // 构建GitHub官方API地址（仅请求开源内容，无需认证）
  const githubApiUrl = `https://api.github.com/search/${searchType}?q=${encodeURIComponent(keyword)}&per_page=15&sort=stars`;

  try {
    // 发送请求并转发响应
    const response = await fetch(githubApiUrl, {
      headers: {
        'User-Agent': 'GitHub Open Source Proxy', // GitHub API要求必须设置User-Agent
        'Accept': 'application/vnd.github.v3+json'
      }
    });

    // 转发响应数据（保持原状态码和JSON格式）
    const data = await response.json();
    return new Response(JSON.stringify(data), {
      status: response.status,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*' // 允许跨域访问
      }
    });
  } catch (err) {
    return new Response(`搜索代理错误：${err.message}`, { status: 500 });
  }
}

/**
 * 处理API代理（仓库详情、Issue列表、Release列表等）
 */
async function handleApiProxy(request) {
  const url = new URL(request.url);
  const apiPath = url.pathname.replace('/api/', ''); // 提取API路径（如：repos/facebook/react）

  // 构建GitHub官方API地址
  const githubApiUrl = `https://api.github.com/${apiPath}${url.search}`;

  try {
    const response = await fetch(githubApiUrl, {
      headers: {
        'User-Agent': 'GitHub Open Source Proxy',
        'Accept': 'application/vnd.github.v3+json'
      }
    });

    const data = await response.json();
    return new Response(JSON.stringify(data), {
      status: response.status,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      }
    });
  } catch (err) {
    return new Response(`API代理错误：${err.message}`, { status: 500 });
  }
}

/**
 * 处理内容浏览（仓库详情、代码查看、Issue详情、Release详情）
 */
async function handleContentBrowse(request) {
  const url = new URL(request.url);
  const path = url.pathname;

  // 1. 查看仓库详情（/repo/用户名/仓库名）
  if (path.startsWith('/repo/')) {
    const repoFullName = path.replace('/repo/', '');
    return renderRepoDetail(repoFullName, url.search);
  }

  // 2. 查看用户主页（/user/用户名）
  if (path.startsWith('/user/')) {
    const userName = path.replace('/user/', '');
    return renderUserDetail(userName, url.search);
  }

  // 3. 查看代码文件（/code/用户名/仓库名/文件路径）
  if (path.startsWith('/code/')) {
    const codePath = path.replace('/code/', '');
    const ref = url.searchParams.get('ref') || 'main'; // 默认主分支
    return renderCodeDetail(codePath, ref);
  }

  // 4. 查看Issue列表（/repo/用户名/仓库名/issues）
  if (path.includes('/issues')) {
    const [repoPart, _] = path.split('/issues');
    const repoFullName = repoPart.replace('/repo/', '');
    const page = url.searchParams.get('page') || 1;
    return renderIssuesList(repoFullName, page);
  }

  // 5. 查看Release列表（/repo/用户名/仓库名/releases）
  if (path.includes('/releases')) {
    const [repoPart, _] = path.split('/releases');
    const repoFullName = repoPart.replace('/repo/', '');
    return renderReleasesList(repoFullName);
  }

  // 未匹配的路径
  return new Response('未找到对应的开源内容', { status: 404 });
}

/**
 * 渲染仓库详情页面
 */
async function renderRepoDetail(repoFullName, searchParams) {
  // 获取仓库基础信息
  const repoApiUrl = `https://api.github.com/repos/${repoFullName}`;
  const repoRes = await fetch(repoApiUrl, {
    headers: { 'User-Agent': 'GitHub Open Source Proxy' }
  });
  if (!repoRes.ok) {
    return new Response(`获取仓库信息失败：${repoRes.statusText}`, { status: repoRes.status });
  }
  const repoData = await repoRes.json();

  // 获取仓库目录（默认主分支）
  const defaultBranch = repoData.default_branch || 'main';
  const contentsApiUrl = `https://api.github.com/repos/${repoFullName}/contents?ref=${defaultBranch}`;
  const contentsRes = await fetch(contentsApiUrl, {
    headers: { 'User-Agent': 'GitHub Open Source Proxy' }
  });
  const contentsData = contentsRes.ok ? await contentsRes.json() : [];

  // 生成HTML页面
  return new Response(`
<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${repoData.full_name} - GitHub开源仓库</title>
  <style>
    * { margin:0; padding:0; box-sizing:border-box; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Arial, sans-serif; }
    body { background:#f6f8fa; padding:20px; }
    .header { background:#fff; padding:20px; border-radius:8px; margin-bottom:20px; box-shadow:0 1px 3px rgba(0,0,0,0.1); }
    .repo-title { display:flex; align-items:center; gap:10px; margin-bottom:15px; }
    .repo-title h1 { font-size:24px; color:#24292e; }
    .repo-desc { color:#586069; margin-bottom:15px; line-height:1.5; }
    .repo-meta { display:flex; flex-wrap:wrap; gap:15px; color:#586069; font-size:14px; }
    .nav { display:flex; gap:20px; margin:20px 0; padding-bottom:10px; border-bottom:1px solid #eaecef; }
    .nav a { color:#0366d6; text-decoration:none; font-size:14px; padding:5px 0; }
    .nav a:hover { text-decoration:underline; }
    .content { background:#fff; padding:20px; border-radius:8px; box-shadow:0 1px 3px rgba(0,0,0,0.1); }
    .dir-title { font-size:16px; color:#24292e; margin-bottom:15px; }
    .dir-list { list-style:none; }
    .dir-item { display:flex; align-items:center; gap:10px; padding:8px 0; border-bottom:1px solid #eaecef; }
    .dir-item:last-child { border-bottom:none; }
    .dir-icon { color:#666; }
    .dir-name a { color:#0366d6; text-decoration:none; }
    .dir-name a:hover { text-decoration:underline; }
    .back-link { display:inline-block; margin-bottom:20px; color:#0366d6; text-decoration:none; }
    .back-link:hover { text-decoration:underline; }
  </style>
</head>
<body>
  <a href="https://github.com/search" class="back-link">← 返回GitHub搜索</a>

  <div class="header">
    <div class="repo-title">
      <svg width="32" height="32" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
        <path d="M12 2C6.477 2 2 6.484 2 12.017C2 17.557 6.477 22 12 22C17.522 22 22 17.557 22 12.017C22 6.484 17.522 2 12 2ZM12 20C7.582 20 4 16.418 4 12.017C4 7.606 7.582 4 12 4C16.418 4 20 7.606 20 12.017C20 16.418 16.418 20 12 20Z" fill="#24292E"/>
        <path d="M12 6.075C10.052 6.075 8.316 7.169 7.374 8.746C7.214 9.014 7.214 9.382 7.374 9.65C7.534 9.918 7.862 10.05 8.19 10.05H8.218C8.362 10.05 8.505 10.095 8.633 10.182C9.176 10.557 9.505 11.162 9.505 11.865C9.505 12.568 9.176 13.173 8.633 13.548C8.505 13.635 8.362 13.68 8.218 13.68H8.19C7.862 13.68 7.534 13.812 7.374 14.08C7.214 14.348 7.214 14.716 7.374 14.984C8.316 16.561 10.052 17.655 12 17.655C13.948 17.655 15.684 16.561 16.626 14.984C16.786 14.716 16.786 14.348 16.626 14.08C16.466 13.812 16.138 13.68 15.81 13.68H15.782C15.638 13.68 15.495 13.635 15.367 13.548C14.824 13.173 14.495 12.568 14.495 11.865C14.495 11.162 14.824 10.557 15.367 10.182C15.495 10.095 15.638 10.05 15.782 10.05H15.81C16.138 10.05 16.466 9.918 16.626 9.65C16.786 9.382 16.786 9.014 16.626 8.746C15.684 7.169 13.948 6.075 12 6.075Z" fill="#24292E"/>
        <path d="M12 8.547C11.448 8.547 11 8.995 11 9.547C11 10.099 11.448 10.547 12 10.547C12.552 10.547 13 10.099 13 9.547C13 8.995 12.552 8.547 12 8.547ZM12 13.68C11.448 13.68 11 13.232 11 12.68C11 12.128 11.448 11.68 12 11.68C12.552 11.68 13 12.128 13 12.68C13 13.232 12.552 13.68 12 13.68Z" fill="#24292E"/>
      </svg>
      <h1>${repoData.full_name}</h1>
    </div>
    <div class="repo-desc">${repoData.description || '无仓库描述'}</div>
    <div class="repo-meta">
      <span>⭐ ${repoData.stargazers_count} 星</span>
      <span>🍴 ${repoData.forks_count} 分支</span>
      <span>💻 ${repoData.language || '未知语言'}</span>
      <span>📅 创建于 ${new Date(repoData.created_at).toLocaleDateString()}</span>
      <span>🔄 更新于 ${new Date(repoData.updated_at).toLocaleDateString()}</span>
    </div>
    <div class="nav">
      <a href="/repo/${repoFullName}">代码</a>
      <a href="/repo/${repoFullName}/issues">Issues (${repoData.open_issues_count})</a>
      <a href="/repo/${repoFullName}/releases">Releases</a>
      <a href="${repoData.html_url}" target="_blank">查看原始GitHub页面</a>
    </div>
  </div>

  <div class="content">
    <div class="dir-title">${defaultBranch} 分支 - 仓库目录</div>
    <ul class="dir-list">
      ${contentsData.map(item => {
        const isDir = item.type === 'dir';
        const icon = isDir ? '📁' : '📄';
        const link = isDir 
          ? `/repo/${repoFullName}/dir/${item.path}?ref=${defaultBranch}` 
          : `/code/${repoFullName}/${item.path}?ref=${defaultBranch}`;
        
        return `<li class="dir-item">
          <span class="dir-icon">${icon}</span>
          <span class="dir-name"><a href="${link}">${item.name}</a></span>
        </li>`;
      }).join('')}
      ${contentsData.length === 0 ? '<li class="dir-item">仓库为空</li>' : ''}
    </ul>
  </div>
</body>
</html>
`, {
    headers: { 'Content-Type': 'text/html; charset=UTF-8' }
  });
}

/**
 * 渲染代码文件查看页面
 */
async function renderCodeDetail(codePath, ref) {
  // 拆分路径：用户名/仓库名/文件路径
  const [userRepo, ...filePathParts] = codePath.split('/');
  const filePath = filePathParts.join('/');
  const [owner, repo] = userRepo.split('/');

  // 获取文件内容（GitHub API返回base64编码的内容）
  const fileApiUrl = `https://api.github.com/repos/${owner}/${repo}/contents/${filePath}?ref=${ref}`;
  const fileRes = await fetch(fileApiUrl, {
    headers: { 'User-Agent': 'GitHub Open Source Proxy' }
  });
  if (!fileRes.ok) {
    return new Response(`获取文件失败：${fileRes.statusText}`, { status: fileRes.status });
  }
  const fileData = await fileRes.json();

  // 解码base64内容
  const fileContent = atob(fileData.content);
  // 获取文件扩展名
  const fileExt = filePath.split('.').pop() || '';

  // 生成HTML页面
  return new Response(`
<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${fileData.name} - ${owner}/${repo}</title>
  <style>
    * { margin:0; padding:0; box-sizing:border-box; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Arial, sans-serif; }
    body { background:#f6f8fa; padding:20px; }
    .back-links { margin-bottom:20px; }
    .back-links a { color:#0366d6; text-decoration:none; margin-right:15px; }
    .back-links a:hover { text-decoration:underline; }
    .file-header { background:#fff; padding:20px; border-radius:8px 8px 0 0; box-shadow:0 1px 3px rgba(0,0,0,0.1); }
    .file-path { color:#586069; margin-bottom:10px; font-size:14px; }
    .file-name { font-size:20px; color:#24292e; margin-bottom:15px; }
    .file-meta { color:#586069; font-size:14px; }
    .code-container { background:#fff; padding:20px; border-radius:0 0 8px 8px; box-shadow:0 1px 3px rgba(0,0,0,0.1); border-top:1px solid #eaecef; }
    .code-pre { 
      background:#f8f9fa; 
      padding:15px; 
      border-radius:6px; 
      overflow-x:auto; 
      font-family: SFMono-Regular, Consolas, "Liberation Mono", Menlo, monospace;
      font-size:14px;
      line-height:1.5;
      color:#24292e;
    }
    .lang-tip { color:#666; font-size:12px; margin-bottom:10px; }
  </style>
</head>
<body>
  <div class="back-links">
    <a href="/repo/${owner}/${repo}">← 返回仓库</a>
    <a href="https://github.com/search">← 返回GitHub搜索</a>
    <a href="${fileData.html_url}" target="_blank">查看原始文件</a>
  </div>

  <div class="file-header">
    <div class="file-path">${owner}/${repo}/${ref}/${filePath}</div>
    <div class="file-name">${fileData.name}</div>
    <div class="file-meta">
      <span>大小：${formatFileSize(fileData.size)}</span> · 
      <span>最后修改：${new Date(fileData.updated_at).toLocaleString()}</span>
    </div>
  </div>

  <div class="code-container">
    <div class="lang-tip">文件类型：${fileExt.toUpperCase()}</div>
    <pre class="code-pre"><code>${escapeHtml(fileContent)}</code></pre>
  </div>
</body>
</html>
`, {
    headers: { 'Content-Type': 'text/html; charset=UTF-8' }
  });
}

/**
 * 渲染Issues列表页面
 */
async function renderIssuesList(repoFullName, page = 1) {
  // 获取Issues列表（仅开源项目的公开Issues）
  const issuesApiUrl = `https://api.github.com/repos/${repoFullName}/issues?state=open&page=${page}&per_page=20`;
  const issuesRes = await fetch(issuesApiUrl, {
    headers: { 
      'User-Agent': 'GitHub Open Source Proxy',
      'Accept': 'application/vnd.github.v3+json'
    }
  });
  if (!issuesRes.ok) {
    return new Response(`获取Issues失败：${issuesRes.statusText}`, { status: issuesRes.status });
  }
  const issuesData = await issuesRes.json();

  // 生成HTML页面
  return new Response(`
<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Issues - ${repoFullName}</title>
  <style>
    * { margin:0; padding:0; box-sizing:border-box; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Arial, sans-serif; }
    body { background:#f6f8fa; padding:20px; }
    .back-link { display:inline-block; margin-bottom:20px; color:#0366d6; text-decoration:none; }
    .back-link:hover { text-decoration:underline; }
    .header { background:#fff; padding:20px; border-radius:8px; margin-bottom:20px; box-shadow:0 1px 3px rgba(0,0,0,0.1); }
    .header h1 { font-size:24px; color:#24292e; margin-bottom:10px; }
    .header p { color:#586069; }
    .issues-list { background:#fff; padding:20px; border-radius:8px; box-shadow:0 1px 3px rgba(0,0,0,0.1); }
    .issue-item { padding:15px; border-bottom:1px solid #eaecef; }
    .issue-item:last-child { border-bottom:none; }
    .issue-title { font-size:18px; margin-bottom:8px; }
    .issue-title a { color:#0366d6; text-decoration:none; }
    .issue-title a:hover { text-decoration:underline; }
    .issue-meta { display:flex; flex-wrap:wrap; gap:15px; color:#586069; font-size:14px; }
    .issue-body { color:#24292e; margin-top:10px; line-height:1.5; font-size:14px; max-height:120px; overflow:hidden; }
    .page-nav { margin-top:20px; text-align:center; }
    .page-nav a { color:#0366d6; text-decoration:none; margin:0 5px; padding:5px 10px; border:1px solid #eaecef; border-radius:4px; }
    .page-nav a:hover { background:#f6f8fa; }
    .no-issues { text-align:center; padding:40px; color:#666; }
  </style>
</head>
<body>
  <a href="/repo/${repoFullName}" class="back-link">← 返回仓库</a>
  <a href="https://github.com/search" class="back-link">← 返回GitHub搜索</a>

  <div class="header">
    <h1>${repoFullName} - Issues</h1>
    <p>公开的开源项目问题（仅显示未关闭的Issues）</p>
  </div>

  <div class="issues-list">
    ${issuesData.length === 0 ? (
      '<div class="no-issues">暂无未关闭的Issues</div>'
    ) : (
      issuesData.map(issue => `
        <div class="issue-item">
          <div class="issue-title">
            <a href="${issue.html_url}" target="_blank">#${issue.number} ${issue.title}</a>
          </div>
          <div class="issue-meta">
            <span>创建者：${issue.user.login}</span>
            <span>创建于：${new Date(issue.created_at).toLocaleDateString()}</span>
            <span>评论数：${issue.comments}</span>
          </div>
          <div class="issue-body">${issue.body ? escapeHtml(issue.body.replace(/\n/g, '<br>').substring(0, 300)) + '...' : '无描述'}</div>
        </div>
      `).join('')
    )}

    ${issuesData.length > 0 ? `
      <div class="page-nav">
        ${page > 1 ? `<a href="/repo/${repoFullName}/issues?page=${parseInt(page)-1}">上一页</a>` : ''}
        <a href="/repo/${repoFullName}/issues?page=${parseInt(page)+1}">下一页</a>
      </div>
    ` : ''}
  </div>
</body>
</html>
`, {
    headers: { 'Content-Type': 'text/html; charset=UTF-8' }
  });
}

/**
 * 渲染Releases列表页面
 */
async function renderReleasesList(repoFullName) {
  // 获取Releases列表
  const releasesApiUrl = `https://api.github.com/repos/${repoFullName}/releases`;
  const releasesRes = await fetch(releasesApiUrl, {
    headers: { 
      'User-Agent': 'GitHub Open Source Proxy',
      'Accept': 'application/vnd.github.v3+json'
    }
  });
  if (!releasesRes.ok) {
    return new Response(`获取Releases失败：${releasesRes.statusText}`, { status: releasesRes.status });
  }
  const releasesData = await releasesRes.json();

  // 生成HTML页面
  return new Response(`
<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Releases - ${repoFullName}</title>
  <style>
    * { margin:0; padding:0; box-sizing:border-box; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Arial, sans-serif; }
    body { background:#f6f8fa; padding:20px; }
    .back-link { display:inline-block; margin-bottom:20px; color:#0366d6; text-decoration:none; }
    .back-link:hover { text-decoration:underline; }
    .header { background:#fff; padding:20px; border-radius:8px; margin-bottom:20px; box-shadow:0 1px 3px rgba(0,0,0,0.1); }
    .header h1 { font-size:24px; color:#24292e; margin-bottom:10px; }
    .releases-list { background:#fff; padding:20px; border-radius:8px; box-shadow:0 1px 3px rgba(0,0,0,0.1); }
    .release-item { padding:20px; border-bottom:1px solid #eaecef; }
    .release-item:last-child { border-bottom:none; }
    .release-header { margin-bottom:15px; }
    .release-tag { font-size:20px; font-weight:bold; color:#24292e; }
    .release-title { font-size:16px; color:#586069; margin-top:5px; }
    .release-meta { display:flex; flex-wrap:wrap; gap:15px; color:#586069; font-size:14px; margin-bottom:15px; }
    .release-body { color:#24292e; line-height:1.5; font-size:14px; margin-bottom:15px; }
    .release-links a { display:inline-block; margin-right:10px; margin-bottom:10px; padding:5px 10px; background:#0366d6; color:#fff; text-decoration:none; border-radius:4px; font-size:14px; }
    .release-links a:hover { background:#0256b3; }
    .no-releases { text-align:center; padding:40px; color:#666; }
  </style>
</head>
<body>
  <a href="/repo/${repoFullName}" class="back-link">← 返回仓库</a>
  <a href="https://github.com/search" class="back-link">← 返回GitHub搜索</a>

  <div class="header">
    <h1>${repoFullName} - Releases</h1>
    <p>开源项目的发布版本（包含发布说明和资源链接）</p>
  </div>

  <div class="releases-list">
    ${releasesData.length === 0 ? (
      '<div class="no-releases">暂无发布版本</div>'
    ) : (
      releasesData.map(release => `
        <div class="release-item">
          <div class="release-header">
            <div class="release-tag">${release.tag_name}</div>
            <div class="release-title">${release.name || '无版本名称'}</div>
          </div>
          <div class="release-meta">
            <span>发布于：${new Date(release.published_at).toLocaleDateString()}</span>
            <span>发布者：${release.author.login}</span>
            <span>资产数：${release.assets.length}</span>
          </div>
          <div class="release-body">${release.body ? escapeHtml(release.body.replace(/\n/g, '<br>').substring(0, 500)) + '...' : '无发布说明'}</div>
          <div class="release-links">
            <a href="${release.html_url}" target="_blank">查看完整发布页</a>
            ${release.assets.length > 0 ? `<a href="${release.assets[0].browser_download_url}" target="_blank">下载最新资产</a>` : ''}
          </div>
        </div>
      `).join('')
    )}
  </div>
</body>
</html>
`, {
    headers: { 'Content-Type': 'text/html; charset=UTF-8' }
  });
}

/**
 * 渲染用户详情页面
 */
async function renderUserDetail(userName) {
  // 获取用户信息
  const userApiUrl = `https://api.github.com/users/${userName}`;
  const userRes = await fetch(userApiUrl, {
    headers: { 'User-Agent': 'GitHub Open Source Proxy' }
  });
  if (!userRes.ok) {
    return new Response(`获取用户信息失败：${userRes.statusText}`, { status: userRes.status });
  }
  const userData = await userRes.json();

  // 获取用户仓库列表
  const reposApiUrl = `https://api.github.com/users/${userName}/repos?sort=pushed&per_page=20`;
  const reposRes = await fetch(reposApiUrl, {
    headers: { 'User-Agent': 'GitHub Open Source Proxy' }
  });
  const reposData = reposRes.ok ? await reposRes.json() : [];

  // 生成HTML页面
  return new Response(`
<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${userData.login} - GitHub用户</title>
  <style>
    * { margin:0; padding:0; box-sizing:border-box; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Arial, sans-serif; }
    body { background:#f6f8fa; padding:20px; }
    .back-link { display:inline-block; margin-bottom:20px; color:#0366d6; text-decoration:none; }
    .back-link:hover { text-decoration:underline; }
    .profile-header { background:#fff; padding:20px; border-radius:8px; margin-bottom:20px; box-shadow:0 1px 3px rgba(0,0,0,0.1); display:flex; gap:20px; flex-wrap:wrap; }
    .avatar { width:120px; height:120px; border-radius:50%; }
    .profile-info { flex:1; min-width:300px; }
    .username { font-size:24px; color:#24292e; margin-bottom:5px; }
    .name { font-size:18px; color:#586069; margin-bottom:15px; }
    .bio { margin-bottom:15px; line-height:1.5; }
    .user-meta { display:flex; flex-wrap:wrap; gap:15px; color:#586069; font-size:14px; margin-bottom:15px; }
    .repos-section { background:#fff; padding:20px; border-radius:8px; box-shadow:0 1px 3px rgba(0,0,0,0.1); }
    .section-title { font-size:20px; color:#24292e; margin-bottom:20px; }
    .repo-list { list-style:none; }
    .repo-item { padding:15px; border-bottom:1px solid #eaecef; }
    .repo-item:last-child { border-bottom:none; }
    .repo-name { font-size:16px; margin-bottom:5px; }
    .repo-name a { color:#0366d6; text-decoration:none; }
    .repo-name a:hover { text-decoration:underline; }
    .repo-desc { color:#586069; margin-bottom:8px; font-size:14px; }
    .repo-meta { color:#586069; font-size:13px; display:flex; gap:15px; }
  </style>
</head>
<body>
  <a href="https://github.com/search" class="back-link">← 返回GitHub搜索</a>

  <div class="profile-header">
    <img src="${userData.avatar_url}" alt="${userData.login}的头像" class="avatar">
    <div class="profile-info">
      <div class="username">${userData.login}</div>
      ${userData.name ? `<div class="name">${userData.name}</div>` : ''}
      ${userData.bio ? `<div class="bio">${escapeHtml(userData.bio)}</div>` : ''}
      <div class="user-meta">
        ${userData.location ? `<span>🏠 ${userData.location}</span>` : ''}
        ${userData.email ? `<span>✉️ ${userData.email}</span>` : ''}
        ${userData.blog ? `<span>🌐 <a href="${userData.blog}" target="_blank">博客</a></span>` : ''}
        <span>📦 ${userData.public_repos} 个开源仓库</span>
        <span>👥 ${userData.followers} 位追随者</span>
        <span>👤 关注 ${userData.following} 人</span>
      </div>
      <a href="${userData.html_url}" target="_blank" style="display:inline-block; padding:5px 10px; background:#0366d6; color:white; text-decoration:none; border-radius:4px; font-size:14px;">查看原始GitHub主页</a>
    </div>
  </div>

  <div class="repos-section">
    <div class="section-title">开源仓库（最近更新）</div>
    <ul class="repo-list">
      ${reposData.length === 0 ? (
        '<li class="repo-item">该用户暂无公开仓库</li>'
      ) : (
        reposData.map(repo => `
          <li class="repo-item">
            <div class="repo-name">
              <a href="/repo/${repo.full_name}">${repo.full_name}</a>
            </div>
            <div class="repo-desc">${repo.description || '无项目描述'}</div>
            <div class="repo-meta">
              <span>💻 ${repo.language || '未知语言'}</span>
              <span>⭐ ${repo.stargazers_count} 星</span>
              <span>🍴 ${repo.forks_count} 分支</span>
              <span>📅 更新于 ${new Date(repo.updated_at).toLocaleDateString()}</span>
            </div>
          </li>
        `).join('')
      )}
    </ul>
  </div>
</body>
</html>
`, {
    headers: { 'Content-Type': 'text/html; charset=UTF-8' }
  });
}

/**
 * 工具函数：格式化文件大小（B → KB/MB）
 */
function formatFileSize(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/**
 * 工具函数：转义HTML特殊字符（防止XSS）
 */
function escapeHtml(str) {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}
