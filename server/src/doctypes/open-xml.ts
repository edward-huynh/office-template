import JSZip from 'jszip';
import { ApiError } from '../shared/errors/api-error.js';

const ZIP_MAGIC = Buffer.from([0x50, 0x4b, 0x03, 0x04]);
const MAX_ENTRIES = 5000;

/**
 * Verifies that a buffer is an Open XML package (a ZIP) containing the entries required for its
 * type. Content type is decided by the bytes, never by the file name the client sent.
 */
export async function assertOpenXmlPackage(file: Buffer, requiredEntries: string[], label: string) {
  if (file.length < ZIP_MAGIC.length || !file.subarray(0, 4).equals(ZIP_MAGIC)) {
    throw ApiError.unsupportedMediaType(`The file is not a valid ${label} document`);
  }
  let zip: JSZip;
  try {
    zip = await JSZip.loadAsync(file);
  } catch {
    throw ApiError.unsupportedMediaType(`The file is not a valid ${label} document`);
  }
  const names = Object.keys(zip.files);
  if (names.length > MAX_ENTRIES) {
    throw ApiError.badRequest('The document package contains too many entries');
  }
  for (const entry of requiredEntries) {
    if (!zip.file(entry)) {
      throw ApiError.unsupportedMediaType(`The file is not a valid ${label} document`);
    }
  }
}
