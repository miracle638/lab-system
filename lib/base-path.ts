export const BASE_PATH = "/lab";

export function withBasePath(path: string) {
  if (!path.startsWith("/")) {
    return `${BASE_PATH}/${path}`;
  }

  return `${BASE_PATH}${path}`;
}