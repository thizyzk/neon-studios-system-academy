const LIST_VIDEO_FIELDS = [
  "id",
  "title",
  "video_description",
  "duration",
  "cover_image_url",
  "share_url",
  "embed_link",
].join(",");

const QUERY_VIDEO_FIELDS = [
  "id",
  "title",
  "video_description",
  "duration",
  "cover_image_url",
  "share_url",
  "embed_link",
  "like_count",
  "comment_count",
  "share_count",
  "view_count",
].join(",");

const USER_FIELDS = [
  "open_id",
  "union_id",
  "avatar_url",
  "display_name",
].join(",");

async function readJson(response) {
  const text = await response.text();
  if (!text) {
    return {};
  }

  try {
    return JSON.parse(text);
  } catch {
    return { raw: text };
  }
}

async function requestJson(url, options) {
  const response = await fetch(url, options);
  const payload = await readJson(response);

  if (!response.ok) {
    const error = new Error(payload.error_description ?? payload.message ?? `TikTok request failed with ${response.status}`);
    error.status = response.status;
    error.payload = payload;
    throw error;
  }

  if (payload.error && payload.error.code && payload.error.code !== "ok") {
    const error = new Error(payload.error.message || payload.error.code);
    error.status = response.status;
    error.payload = payload;
    throw error;
  }

  return payload;
}

function buildTokenForm(config, entries) {
  const form = new URLSearchParams();
  form.set("client_key", config.tiktokClientKey);
  form.set("client_secret", config.tiktokClientSecret);

  for (const [key, value] of Object.entries(entries)) {
    if (value) {
      form.set(key, value);
    }
  }

  return form;
}

export async function exchangeAuthorizationCode(config, code, codeVerifier) {
  const form = buildTokenForm(config, {
    code,
    grant_type: "authorization_code",
    redirect_uri: config.tiktokRedirectUri,
    code_verifier: codeVerifier,
  });

  return requestJson(`${config.tiktokApiBaseUrl}/v2/oauth/token/`, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      "Cache-Control": "no-cache",
    },
    body: form,
  });
}

export async function refreshAccessToken(config, refreshToken) {
  const form = buildTokenForm(config, {
    grant_type: "refresh_token",
    refresh_token: refreshToken,
  });

  return requestJson(`${config.tiktokApiBaseUrl}/v2/oauth/token/`, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      "Cache-Control": "no-cache",
    },
    body: form,
  });
}

export async function getUserInfo(config, accessToken) {
  const url = `${config.tiktokApiBaseUrl}/v2/user/info/?fields=${encodeURIComponent(USER_FIELDS)}`;
  const payload = await requestJson(url, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });

  return payload.data?.user ?? null;
}

export async function listVideos(config, accessToken, maxCount) {
  const url = `${config.tiktokApiBaseUrl}/v2/video/list/?fields=${encodeURIComponent(LIST_VIDEO_FIELDS)}`;
  const payload = await requestJson(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      max_count: Math.max(1, Math.min(20, maxCount)),
    }),
  });

  return {
    videos: payload.data?.videos ?? [],
    cursor: payload.data?.cursor ?? 0,
    hasMore: payload.data?.has_more ?? false,
  };
}

export async function queryVideos(config, accessToken, videoIds) {
  const uniqueVideoIds = [...new Set(videoIds.filter(Boolean))].slice(0, 20);
  if (uniqueVideoIds.length === 0) {
    return [];
  }

  const url = `${config.tiktokApiBaseUrl}/v2/video/query/?fields=${encodeURIComponent(QUERY_VIDEO_FIELDS)}`;
  const payload = await requestJson(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      filters: {
        video_ids: uniqueVideoIds,
      },
    }),
  });

  return payload.data?.videos ?? [];
}
