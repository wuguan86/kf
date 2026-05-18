package com.shijie.transit.common.db.mapper;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.shijie.transit.common.db.entity.InvitationCodeEntity;
import java.time.LocalDateTime;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;
import org.apache.ibatis.annotations.Update;

@Mapper
public interface InvitationCodeMapper extends BaseMapper<InvitationCodeEntity> {
  @Update("""
      UPDATE invitation_code
      SET used_count = used_count + 1,
          updated_at = #{updatedAt}
      WHERE id = #{id}
        AND used_count < total_count
        AND (start_time IS NULL OR start_time <= #{now})
        AND (end_time IS NULL OR end_time >= #{now})
      """)
  int markRedeemedIfAvailable(
      @Param("id") Long id,
      @Param("now") LocalDateTime now,
      @Param("updatedAt") LocalDateTime updatedAt);
}
