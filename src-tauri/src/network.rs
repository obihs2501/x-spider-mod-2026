use std::collections::HashMap;
use reqwest::Method;
use serde_json::Value;

#[derive(Default, serde::Serialize)]
pub struct Response {
  status: u16,
  headers: HashMap<String, Vec<String>>,
  body: Value,
}

#[tauri::command]
pub async fn network_fetch(
  method: String,
  url: String,
  body: String,
  enable_proxy: bool,
  proxy_url: String,
  response_type: String,
  headers: HashMap<String, String>,
) -> Result<Response, String> {
  let map_reqwest_err = |err: reqwest::Error| err.to_string();
  // Convert method string into Method
  let method: Method = match method.to_uppercase().as_str() {
    "GET" => Ok(Method::GET),
    "POST" => Ok(Method::POST),
    "PATCH" => Ok(Method::PATCH),
    "PUT" => Ok(Method::PUT),
    "DELETE" => Ok(Method::DELETE),
    "HEAD" => Ok(Method::HEAD),
    _ => Err("Invalid method".to_string()),
  }?;

  // Build client
  let client = {
    let mut b = reqwest::Client::builder();

    // Auto set proxy settings
    if enable_proxy {
      if proxy_url.len() == 0 {
        // Use system proxy, do nothing
      } else {
        // Use custom proxy url
        let proxy_http = reqwest::Proxy::http(proxy_url.clone()).or(Err("Failed to set proxy url".to_string()))?;
        let proxy_https = reqwest::Proxy::https(proxy_url.clone()).or(Err("Failed to set proxy url".to_string()))?;
        b = b.proxy(proxy_http).proxy(proxy_https);
      }
    } else {
      // No proxy
      b = b.no_proxy();
    }

    b.build().or(Err("Failed to build reqwest client".to_string()))
  }?;

  // Build request
  let request = {
    let mut req = client.request(method.clone(), url);
    for (k, v) in headers {
      req = req.header(k, v);
    }

    if !matches!(method.clone(), Method::GET) {
      req = req.body(body);
    }

    req
  };

  // Send request
  let response = request.send().await.map_err(map_reqwest_err)?;

  // Extract some info
  let status = response.status().as_u16();
  let resp_headers = {
    let reqwest_headers = response.headers();
    let mut h: HashMap<String, Vec<String>> = HashMap::with_capacity(reqwest_headers.len());

    for (k, v) in reqwest_headers {
      let v = v.to_str();
      if let Err(_) = v {
        continue;
      }

      let v = v.unwrap().to_string();
      h.entry(k.to_string()).and_modify(|arr: &mut Vec<String>| arr.push(v.clone()))
        .or_insert_with(|| vec![v]);
    }

    h
  };

  // Load response body. 先读取原始文本再解析 JSON：X 的 GraphQL queryId
  // 失效/限流时可能返回 HTML 或空响应，直接 response.json() 只会产生难以定位的
  // "expected value at line 1 column 1"。这里保留状态码与正文摘要。
  let body: Value = {
    match response_type.as_str() {
      "json" => {
        let status = response.status().as_u16();
        let content_type = response.headers()
          .get(reqwest::header::CONTENT_TYPE)
          .and_then(|v| v.to_str().ok())
          .unwrap_or("")
          .to_string();
        let text = response.text().await.map_err(map_reqwest_err)?;
        serde_json::from_str::<Value>(&text).map_err(|err| {
          let preview: String = text.chars().take(300).collect();
          format!(
            "响应不是有效 JSON（HTTP {}，Content-Type={}）：{}；正文摘要：{}",
            status,
            content_type,
            err,
            if preview.is_empty() { "[空响应]" } else { preview.as_str() }
          )
        })
      },
      "text" => response.text().await.map_err(map_reqwest_err).map(Value::String),
      "binary" => {
        let bytes = response.bytes().await.map_err(map_reqwest_err)?;
        serde_json::to_value(bytes.to_vec()).map_err(|err| err.to_string())
      },
      _ => Err("Unsupported response type".to_string())
    }
  }?;

  return Ok(Response {
    status,
    body,
    headers: resp_headers })
}

#[tauri::command]
pub async fn network_get_system_proxy_url() -> Result<HashMap<String, String>, ()> {
    // 空实现：直接返回空代理列表，绕过旧版API的兼容性问题
    Ok(HashMap::new())
}

