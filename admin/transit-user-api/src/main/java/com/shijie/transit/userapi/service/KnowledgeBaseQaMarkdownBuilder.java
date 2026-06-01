package com.shijie.transit.userapi.service;

import java.util.List;
import org.springframework.stereotype.Component;
import org.springframework.util.StringUtils;

@Component
public class KnowledgeBaseQaMarkdownBuilder {
  public String buildMarkdown(List<KnowledgeBaseQaExtractionService.CleaningQaItem> items) {
    if (items == null || items.isEmpty()) {
      throw new IllegalArgumentException("请至少保留一条问答后再入库");
    }
    StringBuilder builder = new StringBuilder();
    for (KnowledgeBaseQaExtractionService.CleaningQaItem item : items) {
      if (!StringUtils.hasText(item.question()) || !StringUtils.hasText(item.answer())) {
        throw new IllegalArgumentException("问答内容不能为空");
      }
      if (!builder.isEmpty()) {
        builder.append("\n\n**********\n\n");
      }
      builder.append("Q：").append(item.question().trim()).append("\n");
      builder.append("A：").append(item.answer().trim());
    }
    return builder.toString();
  }
}
