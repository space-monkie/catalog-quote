import { ALL_SCOPES, MCP_RESOURCE_URL, OAUTH_ENDPOINTS, OAUTH_ISSUER } from "./config";

/** RFC 8414 authorization server metadata. */
export const authorizationServerMetadata = {
  issuer: OAUTH_ISSUER,
  authorization_endpoint: OAUTH_ENDPOINTS.authorization,
  token_endpoint: OAUTH_ENDPOINTS.token,
  registration_endpoint: OAUTH_ENDPOINTS.registration,
  revocation_endpoint: OAUTH_ENDPOINTS.revocation,
  response_types_supported: ["code"],
  response_modes_supported: ["query"],
  grant_types_supported: ["authorization_code", "refresh_token"],
  code_challenge_methods_supported: ["S256"],
  token_endpoint_auth_methods_supported: ["none"],
  revocation_endpoint_auth_methods_supported: ["none"],
  scopes_supported: ALL_SCOPES,
  client_id_metadata_document_supported: true,
  authorization_response_iss_parameter_supported: true,
  service_documentation: `${OAUTH_ISSUER}/`,
};

/** RFC 9728 protected resource metadata for the MCP endpoint. */
export const protectedResourceMetadata = {
  resource: MCP_RESOURCE_URL,
  authorization_servers: [OAUTH_ISSUER],
  scopes_supported: ALL_SCOPES,
  bearer_methods_supported: ["header"],
  resource_name: "Catalog Quote",
};
