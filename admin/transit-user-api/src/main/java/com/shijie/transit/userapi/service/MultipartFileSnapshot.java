package com.shijie.transit.userapi.service;

import java.io.ByteArrayInputStream;
import java.io.IOException;
import java.io.InputStream;
import org.springframework.web.multipart.MultipartFile;

class MultipartFileSnapshot implements MultipartFile {
  private final String originalFileName;
  private final String contentType;
  private final byte[] bytes;

  MultipartFileSnapshot(String originalFileName, String contentType, byte[] bytes) {
    this.originalFileName = originalFileName;
    this.contentType = contentType;
    this.bytes = bytes == null ? new byte[0] : bytes.clone();
  }

  @Override
  public String getName() {
    return "file";
  }

  @Override
  public String getOriginalFilename() {
    return originalFileName;
  }

  @Override
  public String getContentType() {
    return contentType;
  }

  @Override
  public boolean isEmpty() {
    return bytes.length == 0;
  }

  @Override
  public long getSize() {
    return bytes.length;
  }

  @Override
  public byte[] getBytes() {
    return bytes.clone();
  }

  @Override
  public InputStream getInputStream() throws IOException {
    return new ByteArrayInputStream(bytes);
  }

  @Override
  public void transferTo(java.io.File dest) {
    throw new UnsupportedOperationException("清洗任务不支持转存临时文件");
  }
}
