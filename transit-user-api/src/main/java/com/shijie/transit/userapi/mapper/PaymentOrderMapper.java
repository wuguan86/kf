package com.shijie.transit.userapi.mapper;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.shijie.transit.common.db.entity.PaymentOrderEntity;
import java.time.LocalDateTime;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;
import org.apache.ibatis.annotations.Update;

@Mapper
public interface PaymentOrderMapper extends BaseMapper<PaymentOrderEntity> {
  @Update("""
      UPDATE payment_order
      SET status = 'SUCCESS',
          grant_applied = 1,
          transaction_id = #{transactionId},
          trade_state = #{tradeState},
          raw_notify = #{rawNotify},
          paid_at = #{paidAt},
          updated_at = #{updatedAt}
      WHERE id = #{id}
        AND grant_applied = 0
      """)
  int markPaidIfNotGranted(
      @Param("id") Long id,
      @Param("transactionId") String transactionId,
      @Param("tradeState") String tradeState,
      @Param("rawNotify") String rawNotify,
      @Param("paidAt") LocalDateTime paidAt,
      @Param("updatedAt") LocalDateTime updatedAt);
}
