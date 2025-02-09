import { CognitoUserPoolEvent } from "aws-lambda";
import type { Lambda as LambdaClient } from "aws-sdk";
import { InvocationResponse } from "aws-sdk/clients/lambda";
import {
  InvalidLambdaResponseError,
  UnexpectedLambdaExceptionError,
  UserLambdaValidationError,
} from "../errors";
import { version as awsSdkVersion } from "aws-sdk/package.json";
import { Logger } from "../log";

interface EventCommonParameters {
  clientId: string;
  userAttributes: Record<string, string>;
  username: string;
  userPoolId: string;
}

interface CustomMessageEvent extends EventCommonParameters {
  clientMetadata: Record<string, string> | undefined;
  codeParameter: string;
  triggerSource:
    | "CustomMessage_AdminCreateUser"
    | "CustomMessage_Authentication"
    | "CustomMessage_ForgotPassword"
    | "CustomMessage_ResendCode"
    | "CustomMessage_SignUp"
    | "CustomMessage_UpdateUserAttribute"
    | "CustomMessage_VerifyUserAttribute";
  usernameParameter: string;
}

interface UserMigrationEvent extends EventCommonParameters {
  clientMetadata: Record<string, string> | undefined;
  password: string;
  triggerSource: "UserMigration_Authentication";
  validationData: Record<string, string> | undefined;
}

interface PreSignUpEvent extends EventCommonParameters {
  clientMetadata: Record<string, string> | undefined;
  triggerSource:
    | "PreSignUp_AdminCreateUser"
    | "PreSignUp_ExternalProvider"
    | "PreSignUp_SignUp";
  validationData: Record<string, string> | undefined;
}

interface PostAuthenticationEvent extends EventCommonParameters {
  clientMetadata: Record<string, string> | undefined;
  triggerSource: "PostAuthentication_Authentication";
}

interface PostConfirmationEvent extends EventCommonParameters {
  triggerSource:
    | "PostConfirmation_ConfirmSignUp"
    | "PostConfirmation_ConfirmForgotPassword";
  clientMetadata: Record<string, string> | undefined;
}

export type CognitoUserPoolResponse = CognitoUserPoolEvent["response"];

export interface FunctionConfig {
  CustomMessage?: string;
  PostAuthentication?: string;
  PostConfirmation?: string;
  PreSignUp?: string;
  UserMigration?: string;
}

export interface Lambda {
  enabled(lambda: keyof FunctionConfig): boolean;
  invoke(
    lambda: "CustomMessage",
    event: CustomMessageEvent
  ): Promise<CognitoUserPoolResponse>;
  invoke(
    lambda: "UserMigration",
    event: UserMigrationEvent
  ): Promise<CognitoUserPoolResponse>;
  invoke(
    lambda: "PreSignUp",
    event: PreSignUpEvent
  ): Promise<CognitoUserPoolResponse>;
  invoke(
    lambda: "PostAuthentication",
    event: PostAuthenticationEvent
  ): Promise<CognitoUserPoolResponse>;
  invoke(
    lambda: "PostConfirmation",
    event: PostConfirmationEvent
  ): Promise<CognitoUserPoolResponse>;
}

export class LambdaService implements Lambda {
  private readonly config: FunctionConfig;
  private readonly lambdaClient: LambdaClient;
  private readonly logger: Logger;

  public constructor(
    config: FunctionConfig,
    lambdaClient: LambdaClient,
    logger: Logger
  ) {
    this.config = config;
    this.lambdaClient = lambdaClient;
    this.logger = logger;
  }

  public enabled(lambda: keyof FunctionConfig): boolean {
    return !!this.config[lambda];
  }

  public async invoke(
    trigger: keyof FunctionConfig,
    event:
      | CustomMessageEvent
      | PostAuthenticationEvent
      | PostConfirmationEvent
      | PreSignUpEvent
      | UserMigrationEvent
  ) {
    const functionName = this.config[trigger];
    if (!functionName) {
      throw new Error(`${trigger} trigger not configured`);
    }

    const lambdaEvent: CognitoUserPoolEvent = {
      version: 0, // TODO: how do we know what this is?
      callerContext: {
        awsSdkVersion,
        clientId: event.clientId,
      },
      region: "local", // TODO: pull from above,
      userPoolId: event.userPoolId,
      triggerSource: event.triggerSource,
      userName: event.username,
      request: {
        userAttributes: event.userAttributes,
      },
      response: {},
    };

    switch (event.triggerSource) {
      case "PostAuthentication_Authentication":
      case "PostConfirmation_ConfirmForgotPassword":
      case "PostConfirmation_ConfirmSignUp": {
        lambdaEvent.request.clientMetadata = event.clientMetadata;
        break;
      }
      case "PreSignUp_AdminCreateUser":
      case "PreSignUp_ExternalProvider":
      case "PreSignUp_SignUp": {
        lambdaEvent.request.clientMetadata = event.clientMetadata;
        lambdaEvent.request.validationData = event.validationData;
        break;
      }
      case "UserMigration_Authentication": {
        lambdaEvent.request.clientMetadata = event.clientMetadata;
        lambdaEvent.request.password = event.password;
        lambdaEvent.request.validationData = event.validationData;

        break;
      }
      case "CustomMessage_SignUp":
      case "CustomMessage_AdminCreateUser":
      case "CustomMessage_ResendCode":
      case "CustomMessage_ForgotPassword":
      case "CustomMessage_UpdateUserAttribute":
      case "CustomMessage_VerifyUserAttribute":
      case "CustomMessage_Authentication": {
        lambdaEvent.request.clientMetadata = event.clientMetadata;
        lambdaEvent.request.codeParameter = event.codeParameter;
        lambdaEvent.request.usernameParameter = event.usernameParameter;
        break;
      }
    }

    this.logger.debug(
      `Invoking "${functionName}" with event`,
      JSON.stringify(lambdaEvent, undefined, 2)
    );
    let result: InvocationResponse;
    try {
      result = await this.lambdaClient
        .invoke({
          FunctionName: functionName,
          InvocationType: "RequestResponse",
          Payload: JSON.stringify(lambdaEvent),
        })
        .promise();
    } catch (ex) {
      this.logger.error(ex);
      throw new UnexpectedLambdaExceptionError();
    }

    this.logger.debug(
      `Lambda completed with StatusCode=${result.StatusCode} and FunctionError=${result.FunctionError}`
    );
    if (result.StatusCode === 200) {
      try {
        const parsedPayload = JSON.parse(result.Payload as string);

        return parsedPayload.response as CognitoUserPoolResponse;
      } catch (err) {
        this.logger.error(err);
        throw new InvalidLambdaResponseError();
      }
    } else {
      this.logger.error(result.FunctionError);
      throw new UserLambdaValidationError(result.FunctionError);
    }
  }
}
