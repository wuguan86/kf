package com.shijie.transit.common.security;

public record TransitJwtClaims(long subjectId, long tenantId, String type, String sessionId) {
}
