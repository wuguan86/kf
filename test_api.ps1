
$headers = @{
    "Content-Type" = "application/json"
    "X-Tenant-Id" = "1"
}
$body = @{
    username = "admin"
    password = "admin123456"
} | ConvertTo-Json

try {
    $response = Invoke-RestMethod -Uri "http://localhost:8081/api/admin/auth/login" -Method Post -Body $body -Headers $headers
    Write-Output "Token: $($response.data.token)"
    
    $token = $response.data.token
    $headers["Authorization"] = "Bearer $token"
    
    $users = Invoke-RestMethod -Uri "http://localhost:8081/api/admin/user-accounts" -Method Get -Headers $headers
    Write-Output "Users:"
    $users.data | Format-Table -Property id, nickname, createdAt
} catch {
    Write-Error $_
    if ($_.Exception.Response) {
        $reader = New-Object System.IO.StreamReader($_.Exception.Response.GetResponseStream())
        $responseBody = $reader.ReadToEnd()
        Write-Output "Response Body: $responseBody"
    }
}
