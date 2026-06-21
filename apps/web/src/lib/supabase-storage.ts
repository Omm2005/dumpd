import { env } from "@dumpd/env/server";

const bucketName = env.SUPABASE_PHOTOS_BUCKET;
const mediaBucketName = `${bucketName}-media`;

function getStorageConfig() {
  if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error(
      "Supabase Storage is not configured. Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.",
    );
  }

  return {
    baseUrl: `${env.SUPABASE_URL.replace(/\/$/, "")}/storage/v1`,
    serviceRoleKey: env.SUPABASE_SERVICE_ROLE_KEY,
  };
}

function storageHeaders(contentType = "application/json") {
  const { serviceRoleKey } = getStorageConfig();

  return {
    Authorization: `Bearer ${serviceRoleKey}`,
    apikey: serviceRoleKey,
    "Content-Type": contentType,
  };
}

export async function ensurePhotosBucket() {
  const { baseUrl } = getStorageConfig();
  const response = await fetch(`${baseUrl}/bucket/${bucketName}`, {
    headers: storageHeaders(),
  });

  if (response.ok) {
    return;
  }

  const createResponse = await fetch(`${baseUrl}/bucket`, {
    method: "POST",
    headers: storageHeaders(),
    body: JSON.stringify({
      id: bucketName,
      name: bucketName,
      public: true,
      file_size_limit: 10 * 1024 * 1024,
      allowed_mime_types: ["image/jpeg", "image/png", "image/webp", "image/gif"],
    }),
  });

  if (!createResponse.ok && createResponse.status !== 409) {
    throw new Error("Could not create the Supabase photos bucket.");
  }
}

export async function uploadPhoto(path: string, file: File) {
  const { baseUrl } = getStorageConfig();
  await ensurePhotosBucket();

  const response = await fetch(
    `${baseUrl}/object/${bucketName}/${path
      .split("/")
      .map(encodeURIComponent)
      .join("/")}`,
    {
      method: "POST",
      headers: {
        ...storageHeaders(file.type),
        "x-upsert": "false",
        "cache-control": "3600",
      },
      body: file,
    },
  );

  if (!response.ok) {
    throw new Error("Photo upload failed.");
  }

  return {
    storagePath: path,
    publicUrl: `${baseUrl}/object/public/${bucketName}/${path
      .split("/")
      .map(encodeURIComponent)
      .join("/")}`,
  };
}

export async function deletePhoto(storagePath: string) {
  const { baseUrl } = getStorageConfig();
  const response = await fetch(`${baseUrl}/object/${bucketName}`, {
    method: "DELETE",
    headers: storageHeaders(),
    body: JSON.stringify({ prefixes: [storagePath] }),
  });

  if (!response.ok) {
    throw new Error("Photo deletion from storage failed.");
  }
}

export async function downloadPhoto(storagePath: string) {
  const { baseUrl } = getStorageConfig();
  const response = await fetch(
    `${baseUrl}/object/authenticated/${bucketName}/${storagePath
      .split("/")
      .map(encodeURIComponent)
      .join("/")}`,
    {
      headers: storageHeaders("application/octet-stream"),
    },
  );

  if (!response.ok) {
    throw new Error("Photo download failed.");
  }

  return response;
}

async function ensureMediaBucket() {
  const { baseUrl } = getStorageConfig();
  const response = await fetch(`${baseUrl}/bucket/${mediaBucketName}`, {
    headers: storageHeaders(),
  });

  if (response.ok) {
    return;
  }

  const createResponse = await fetch(`${baseUrl}/bucket`, {
    method: "POST",
    headers: storageHeaders(),
    body: JSON.stringify({
      id: mediaBucketName,
      name: mediaBucketName,
      public: true,
      file_size_limit: 100 * 1024 * 1024,
      allowed_mime_types: ["video/mp4", "video/webm", "video/quicktime"],
    }),
  });

  if (!createResponse.ok && createResponse.status !== 409) {
    throw new Error("Could not create the Supabase media bucket.");
  }
}

export async function uploadMedia(path: string, file: File) {
  const { baseUrl } = getStorageConfig();
  await ensureMediaBucket();

  const response = await fetch(
    `${baseUrl}/object/${mediaBucketName}/${path
      .split("/")
      .map(encodeURIComponent)
      .join("/")}`,
    {
      method: "POST",
      headers: {
        ...storageHeaders(file.type),
        "x-upsert": "false",
        "cache-control": "31536000",
      },
      body: file,
    },
  );

  if (!response.ok) {
    throw new Error("Video upload failed.");
  }

  return {
    storagePath: path,
    publicUrl: `${baseUrl}/object/public/${mediaBucketName}/${path
      .split("/")
      .map(encodeURIComponent)
      .join("/")}`,
  };
}

export async function deleteMedia(storagePath: string) {
  const { baseUrl } = getStorageConfig();
  const response = await fetch(`${baseUrl}/object/${mediaBucketName}`, {
    method: "DELETE",
    headers: storageHeaders(),
    body: JSON.stringify({ prefixes: [storagePath] }),
  });

  if (!response.ok) {
    throw new Error("Video deletion from storage failed.");
  }
}
