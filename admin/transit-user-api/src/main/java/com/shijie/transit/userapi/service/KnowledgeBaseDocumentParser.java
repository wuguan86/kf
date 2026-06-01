package com.shijie.transit.userapi.service;

import java.io.InputStream;
import java.util.Locale;
import org.apache.tika.Tika;
import org.springframework.stereotype.Component;
import org.springframework.util.StringUtils;
import org.springframework.web.multipart.MultipartFile;

@Component
public class KnowledgeBaseDocumentParser {
  private static final long MAX_FILE_SIZE = 10L * 1024L * 1024L;
  private final Tika tika = new Tika();

  public String parseAndClean(MultipartFile file) throws Exception {
    validateFile(file);
    try (InputStream inputStream = file.getInputStream()) {
      return cleanExtractedText(tika.parseToString(inputStream));
    }
  }

  public void validateFile(MultipartFile file) {
    if (file == null || file.isEmpty()) {
      throw new IllegalArgumentException("请选择需要清洗的知识文件");
    }
    if (file.getSize() > MAX_FILE_SIZE) {
      throw new IllegalArgumentException("文件超过 10MB 限制");
    }
    String extension = resolveExtension(file.getOriginalFilename());
    if (!ListOfAllowedExtensions.contains(extension)) {
      throw new IllegalArgumentException("仅支持 PDF、Word、TXT、MD、Excel 文件");
    }
  }

  public String cleanExtractedText(String rawText) {
    if (!StringUtils.hasText(rawText)) {
      return "";
    }
    String normalized = rawText
        .replace("\r\n", "\n")
        .replace('\r', '\n')
        .replaceAll("[\\p{Cntrl}&&[^\n\t]]", "")
        .replaceAll("(?m)^\\s*[—\\-_=]*\\s*第\\s*\\d+\\s*页\\s*[—\\-_=]*\\s*$", "")
        .replaceAll("(?m)^\\s*Page\\s+\\d+\\s*(of\\s+\\d+)?\\s*$", "")
        .replaceAll("[ \\t\\x0B\\f]+", " ")
        .replaceAll("(?m)^\\s+$", "")
        .replaceAll("\\n{3,}", "\n\n")
        .trim();
    return normalized;
  }

  public String resolveExtension(String fileName) {
    if (!StringUtils.hasText(fileName)) {
      return "";
    }
    int index = fileName.lastIndexOf('.');
    if (index < 0 || index >= fileName.length() - 1) {
      return "";
    }
    return fileName.substring(index + 1).toLowerCase(Locale.ROOT);
  }

  private enum ListOfAllowedExtensions {
    ;

    static boolean contains(String extension) {
      return "pdf".equals(extension)
          || "doc".equals(extension)
          || "docx".equals(extension)
          || "txt".equals(extension)
          || "md".equals(extension)
          || "xls".equals(extension)
          || "xlsx".equals(extension);
    }
  }
}
