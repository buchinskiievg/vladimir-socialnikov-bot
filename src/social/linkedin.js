import { isDryRun } from "./shared.js";

export async function publishLinkedIn(post, env) {
  const owner = linkedinOwner(post.target, env);
  if (!env.LINKEDIN_ACCESS_TOKEN || !owner) {
    return { ok: false, message: "missing LinkedIn credentials" };
  }

  if (isDryRun(env)) {
    return { ok: true, message: post.imageUrl ? "dry run with image" : "dry run without image" };
  }

  if (post.imageUrl) {
    return publishLinkedInImagePost(post, env, owner);
  }

  const response = await fetch("https://api.linkedin.com/v2/ugcPosts", {
    method: "POST",
    headers: {
      "authorization": `Bearer ${env.LINKEDIN_ACCESS_TOKEN}`,
      "content-type": "application/json",
      "x-restli-protocol-version": "2.0.0"
    },
    body: JSON.stringify({
      author: owner,
      lifecycleState: "PUBLISHED",
      specificContent: {
        "com.linkedin.ugc.ShareContent": {
          shareCommentary: { text: post.text },
          shareMediaCategory: "NONE"
        }
      },
      visibility: {
        "com.linkedin.ugc.MemberNetworkVisibility": "PUBLIC"
      }
    })
  });

  if (!response.ok) {
    return { ok: false, message: await response.text() };
  }

  return { ok: true, message: response.headers.get("x-restli-id") || "published" };
}

async function publishLinkedInImagePost(post, env, owner) {
  const image = await fetchImage(post.imageUrl);
  if (!image.ok) return image;

  const upload = await registerLinkedInImageUpload(env, owner);
  if (!upload.ok) return upload;

  const uploadResponse = await fetch(upload.uploadUrl, {
    method: "PUT",
    headers: {
      "authorization": `Bearer ${env.LINKEDIN_ACCESS_TOKEN}`,
      "content-type": image.contentType
    },
    body: image.bytes
  });

  if (!uploadResponse.ok) {
    return { ok: false, message: `LinkedIn image upload failed: ${uploadResponse.status} ${await uploadResponse.text()}` };
  }

  const response = await fetch("https://api.linkedin.com/v2/ugcPosts", {
    method: "POST",
    headers: {
      "authorization": `Bearer ${env.LINKEDIN_ACCESS_TOKEN}`,
      "content-type": "application/json",
      "x-restli-protocol-version": "2.0.0"
    },
    body: JSON.stringify({
      author: owner,
      lifecycleState: "PUBLISHED",
      specificContent: {
        "com.linkedin.ugc.ShareContent": {
          shareCommentary: { text: post.text },
          shareMediaCategory: "IMAGE",
          media: [{
            status: "READY",
            media: upload.asset
          }]
        }
      },
      visibility: {
        "com.linkedin.ugc.MemberNetworkVisibility": "PUBLIC"
      }
    })
  });

  if (!response.ok) {
    return { ok: false, message: await response.text() };
  }

  return { ok: true, message: response.headers.get("x-restli-id") || "published with image" };
}

async function registerLinkedInImageUpload(env, owner) {
  const response = await fetch("https://api.linkedin.com/v2/assets?action=registerUpload", {
    method: "POST",
    headers: {
      "authorization": `Bearer ${env.LINKEDIN_ACCESS_TOKEN}`,
      "content-type": "application/json",
      "x-restli-protocol-version": "2.0.0"
    },
    body: JSON.stringify({
      registerUploadRequest: {
        recipes: ["urn:li:digitalmediaRecipe:feedshare-image"],
        owner,
        serviceRelationships: [{
          relationshipType: "OWNER",
          identifier: "urn:li:userGeneratedContent"
        }]
      }
    })
  });

  const body = await response.json().catch(async () => ({ error: await response.text() }));
  if (!response.ok) {
    return { ok: false, message: `LinkedIn register image upload failed: ${response.status} ${JSON.stringify(body)}` };
  }

  const value = body.value || {};
  const uploadUrl = value.uploadMechanism?.["com.linkedin.digitalmedia.uploading.MediaUploadHttpRequest"]?.uploadUrl;
  const asset = value.asset;
  if (!uploadUrl || !asset) {
    return { ok: false, message: `LinkedIn register image upload returned no upload URL or asset: ${JSON.stringify(body)}` };
  }

  return { ok: true, uploadUrl, asset };
}

async function fetchImage(imageUrl) {
  const response = await fetch(imageUrl);
  if (!response.ok) {
    return { ok: false, message: `image download failed: ${response.status} ${await response.text()}` };
  }

  const contentType = response.headers.get("content-type") || "image/png";
  if (!contentType.startsWith("image/")) {
    return { ok: false, message: `image URL did not return an image: ${contentType}` };
  }

  return {
    ok: true,
    bytes: await response.arrayBuffer(),
    contentType
  };
}

function linkedinOwner(target, env) {
  if (target === "linkedin_personal") return env.LINKEDIN_PERSON_URN;
  if (target === "linkedin_company") return env.LINKEDIN_ORGANIZATION_URN;
  return env.LINKEDIN_ORGANIZATION_URN || env.LINKEDIN_PERSON_URN;
}
