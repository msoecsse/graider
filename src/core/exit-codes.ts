export enum ExitCode {
  Success = 0,
  CommandError = 1,
  PartialSuccess = 2,
  AuthenticationOrAuthorizationFailure = 3,
  GitHubOrNetworkFailure = 4,
  ConfigurationOrSchemaError = 5
}
