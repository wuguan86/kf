package com.shijie.transit.common.security;

public record TransitPrincipal(long subjectId, long tenantId, String type) {
}
