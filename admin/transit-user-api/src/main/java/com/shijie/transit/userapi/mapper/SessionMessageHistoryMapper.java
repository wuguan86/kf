package com.shijie.transit.userapi.mapper;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.shijie.transit.common.db.entity.SessionMessageHistoryEntity;
import java.time.LocalDateTime;
import java.util.List;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;
import org.apache.ibatis.annotations.Select;

@Mapper
public interface SessionMessageHistoryMapper extends BaseMapper<SessionMessageHistoryEntity> {
  @Select("""
      SELECT h.session_key AS contactKey, MAX(h.id) AS maxMsgId
      FROM session_message_history h
      LEFT JOIN user_intent ui
        ON ui.tenant_id = h.tenant_id
       AND ui.owner_user_id = h.user_id
       AND ui.contact_key = h.session_key
      WHERE h.tenant_id = #{tenantId}
        AND h.user_id = #{ownerUserId}
        AND h.sender_type = 'USER'
      GROUP BY h.session_key, ui.last_analyzed_msg_id
      HAVING MAX(h.id) > IFNULL(ui.last_analyzed_msg_id, 0)
      """)
  List<PendingContact> findPendingContacts(@Param("tenantId") Long tenantId, @Param("ownerUserId") Long ownerUserId);

  @Select("""
      SELECT id, sender_type AS senderType, message_content AS messageContent, sent_at AS sentAt
      FROM session_message_history
      WHERE tenant_id = #{tenantId}
        AND user_id = #{ownerUserId}
        AND sender_type = 'USER'
        AND session_key = #{contactKey}
        AND id > #{afterMsgId}
      ORDER BY id ASC
      LIMIT #{limit}
      """)
  List<MessageItem> findNewUserMessages(
      @Param("tenantId") Long tenantId,
      @Param("ownerUserId") Long ownerUserId,
      @Param("contactKey") String contactKey,
      @Param("afterMsgId") Long afterMsgId,
      @Param("limit") int limit);

  @Select("""
      SELECT id, sender_type AS senderType, message_content AS messageContent, sent_at AS sentAt
      FROM session_message_history
      WHERE tenant_id = #{tenantId}
        AND user_id = #{ownerUserId}
        AND session_key = #{contactKey}
        AND id <= #{toMsgId}
      ORDER BY id DESC
      LIMIT #{limit}
      """)
  List<MessageItem> findRecentConversationMessages(
      @Param("tenantId") Long tenantId,
      @Param("ownerUserId") Long ownerUserId,
      @Param("contactKey") String contactKey,
      @Param("toMsgId") Long toMsgId,
      @Param("limit") int limit);

  class PendingContact {
    private String contactKey;
    private Long maxMsgId;

    public String getContactKey() {
      return contactKey;
    }

    public void setContactKey(String contactKey) {
      this.contactKey = contactKey;
    }

    public Long getMaxMsgId() {
      return maxMsgId;
    }

    public void setMaxMsgId(Long maxMsgId) {
      this.maxMsgId = maxMsgId;
    }
  }

  class MessageItem {
    private Long id;
    private String senderType;
    private String messageContent;
    private LocalDateTime sentAt;

    public Long getId() {
      return id;
    }

    public void setId(Long id) {
      this.id = id;
    }

    public String getSenderType() {
      return senderType;
    }

    public void setSenderType(String senderType) {
      this.senderType = senderType;
    }

    public String getMessageContent() {
      return messageContent;
    }

    public void setMessageContent(String messageContent) {
      this.messageContent = messageContent;
    }

    public LocalDateTime getSentAt() {
      return sentAt;
    }

    public void setSentAt(LocalDateTime sentAt) {
      this.sentAt = sentAt;
    }
  }
}
