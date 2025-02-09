import { CognitoService, UserPoolService } from "../services";

export const newMockCognitoService = (
  userPoolClient: UserPoolService
): jest.Mocked<CognitoService> => ({
  createUserPool: jest.fn(),
  getAppClient: jest.fn(),
  getUserPool: jest.fn().mockResolvedValue(userPoolClient),
  getUserPoolForClientId: jest.fn().mockResolvedValue(userPoolClient),
  listUserPools: jest.fn(),
});
