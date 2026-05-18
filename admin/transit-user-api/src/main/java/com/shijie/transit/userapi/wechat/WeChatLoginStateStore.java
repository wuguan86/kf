package com.shijie.transit.userapi.wechat;

import java.util.concurrent.atomic.AtomicReference;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;
import org.springframework.stereotype.Component;

@Component
public class WeChatLoginStateStore {
  private final Clock clock;
  private final Map<String, StateRecord> map = new ConcurrentHashMap<>();
  private final Duration ttl = Duration.ofMinutes(10);

  public WeChatLoginStateStore(Clock clock) {
    this.clock = clock;
  }

  public String createState(long tenantId, String redirect) {
    String state = UUID.randomUUID().toString().replace("-", "");
    map.put(state, new StateRecord(tenantId, redirect, Instant.now(clock).plus(ttl), Status.PENDING, null));
    return state;
  }

  public StateValue beginCallback(String state) {
    if (state == null) {
      return null;
    }
    Instant now = Instant.now(clock);
    AtomicReference<StateValue> valueRef = new AtomicReference<>();
    map.compute(state, (key, existing) -> {
      if (existing == null) {
        return null;
      }
      if (now.isAfter(existing.expiresAt())) {
        return null;
      }
      if (existing.status() != Status.PENDING) {
        return existing;
      }
      valueRef.set(new StateValue(existing.tenantId(), existing.redirect(), existing.expiresAt()));
      return new StateRecord(existing.tenantId(), existing.redirect(), existing.expiresAt(), Status.PROCESSING, null);
    });
    return valueRef.get();
  }

  public Snapshot snapshot(String state) {
    if (state == null) {
      return new Snapshot(Status.INVALID, null, null);
    }
    StateRecord existing = map.get(state);
    if (existing == null) {
      return new Snapshot(Status.INVALID, null, null);
    }
    Instant now = Instant.now(clock);
    if (now.isAfter(existing.expiresAt())) {
      map.remove(state);
      return new Snapshot(Status.EXPIRED, null, null);
    }
    StateValue stateValue = new StateValue(existing.tenantId(), existing.redirect(), existing.expiresAt());
    return new Snapshot(existing.status(), stateValue, existing.callbackValue());
  }

  public void complete(String state, CallbackValue value) {
    if (state == null || value == null) {
      return;
    }
    Instant now = Instant.now(clock);
    map.compute(state, (key, existing) -> {
      if (existing == null) {
        return null;
      }
      if (now.isAfter(existing.expiresAt())) {
        return null;
      }
      return new StateRecord(existing.tenantId(), existing.redirect(), existing.expiresAt(), Status.COMPLETED, value);
    });
  }

  public void fail(String state) {
    if (state == null) {
      return;
    }
    Instant now = Instant.now(clock);
    map.compute(state, (key, existing) -> {
      if (existing == null) {
        return null;
      }
      if (now.isAfter(existing.expiresAt())) {
        return null;
      }
      if (existing.status() == Status.COMPLETED) {
        return existing;
      }
      return new StateRecord(existing.tenantId(), existing.redirect(), existing.expiresAt(), Status.FAILED, existing.callbackValue());
    });
  }

  public PollResult poll(String state) {
    if (state == null) {
      return new PollResult(Status.INVALID, null);
    }
    Instant now = Instant.now(clock);
    AtomicReference<PollResult> resultRef = new AtomicReference<>();
    map.compute(state, (key, existing) -> {
      if (existing == null) {
        resultRef.set(new PollResult(Status.INVALID, null));
        return null;
      }
      if (now.isAfter(existing.expiresAt())) {
        resultRef.set(new PollResult(Status.EXPIRED, null));
        return null;
      }
      if (existing.status() == Status.COMPLETED && existing.callbackValue() != null) {
        resultRef.set(new PollResult(Status.COMPLETED, existing.callbackValue()));
        return existing;
      }
      resultRef.set(new PollResult(existing.status(), null));
      return existing;
    });
    return resultRef.get() == null ? new PollResult(Status.INVALID, null) : resultRef.get();
  }

  public record StateValue(long tenantId, String redirect, Instant expiresAt) {
  }

  public record CallbackValue(String token, long userId, long tenantId, boolean initializing, String sessionId) {
  }

  public record PollResult(Status status, CallbackValue callbackValue) {
  }

  public record Snapshot(Status status, StateValue stateValue, CallbackValue callbackValue) {
  }

  public enum Status {
    PENDING,
    PROCESSING,
    COMPLETED,
    FAILED,
    EXPIRED,
    INVALID
  }

  private record StateRecord(long tenantId, String redirect, Instant expiresAt, Status status, CallbackValue callbackValue) {
  }
}
