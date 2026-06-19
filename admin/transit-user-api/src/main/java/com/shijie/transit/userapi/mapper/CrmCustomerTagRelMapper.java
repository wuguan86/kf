package com.shijie.transit.userapi.mapper;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.shijie.transit.common.db.entity.CrmCustomerTagRelEntity;
import java.util.List;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;
import org.apache.ibatis.annotations.Select;

/**
 * CRM 客户-标签关联 Mapper。
 */
@Mapper
public interface CrmCustomerTagRelMapper extends BaseMapper<CrmCustomerTagRelEntity> {

  /** 查询某客户已关联的标签ID列表。 */
  @Select("""
      SELECT tag_id FROM crm_customer_tag_rel
      WHERE tenant_id = #{tenantId}
        AND customer_id = #{customerId}
      """)
  List<Long> findTagIdsByCustomer(
      @Param("tenantId") Long tenantId,
      @Param("customerId") Long customerId);

  /** 查询某租户下多客户的标签映射(用于列表批量回填标签)。 */
  @Select("""
      <script>
      SELECT r.customer_id AS customerId, r.tag_id AS tagId,
             t.name AS tagName, t.color AS tagColor, t.category AS tagCategory
      FROM crm_customer_tag_rel r
      LEFT JOIN crm_customer_tag t
        ON t.tenant_id = r.tenant_id AND t.id = r.tag_id
      WHERE r.tenant_id = #{tenantId}
        AND r.customer_id IN
        <foreach collection="customerIds" item="cid" open="(" separator="," close=")">
          #{cid}
        </foreach>
      </script>
      """)
  List<CustomerTagProjection> findTagsByCustomers(
      @Param("tenantId") Long tenantId,
      @Param("customerIds") List<Long> customerIds);

  class CustomerTagProjection {
    private Long customerId;
    private Long tagId;
    private String tagName;
    private String tagColor;
    private String tagCategory;

    public Long getCustomerId() { return customerId; }
    public void setCustomerId(Long customerId) { this.customerId = customerId; }
    public Long getTagId() { return tagId; }
    public void setTagId(Long tagId) { this.tagId = tagId; }
    public String getTagName() { return tagName; }
    public void setTagName(String tagName) { this.tagName = tagName; }
    public String getTagColor() { return tagColor; }
    public void setTagColor(String tagColor) { this.tagColor = tagColor; }
    public String getTagCategory() { return tagCategory; }
    public void setTagCategory(String tagCategory) { this.tagCategory = tagCategory; }
  }
}
