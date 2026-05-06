// GitHub Contents API — read/write data files without a local filesystem
const axios = require('axios');

const OWNER = process.env.GITHUB_OWNER || 'weerasakdev-ball';
const REPO  = process.env.GITHUB_REPO  || 'boxingfandom';

function ghClient() {
  return axios.create({
    baseURL: 'https://api.github.com',
    headers: {
      Authorization:          `Bearer ${process.env.GITHUB_TOKEN}`,
      Accept:                 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
    },
  });
}

// Returns { content: string, sha: string } or null if 404
async function getFile(path) {
  try {
    const res = await ghClient().get(`/repos/${OWNER}/${REPO}/contents/${path}`);
    return {
      content: Buffer.from(res.data.content, 'base64').toString('utf-8'),
      sha:     res.data.sha,
    };
  } catch (e) {
    if (e.response?.status === 404) return null;
    throw e;
  }
}

async function putFile(path, content, sha, message) {
  const encoded = Buffer.from(content, 'utf-8').toString('base64');
  await ghClient().put(`/repos/${OWNER}/${REPO}/contents/${path}`, {
    message,
    content: encoded,
    sha,
  });
}

// List all .json files in a directory path (shallow, no recursion)
async function listDir(dirPath) {
  const res = await ghClient().get(`/repos/${OWNER}/${REPO}/contents/${dirPath}`);
  return res.data
    .filter(f => f.type === 'file' && f.name.endsWith('.json'))
    .map(f => f.name);
}

module.exports = { getFile, putFile, listDir };
