/*
 * Copyright (c) 2019-Present, Okta, Inc. and/or its affiliates. All rights reserved.
 * The Okta software accompanied by this notice is provided pursuant to the Apache License, Version 2.0 (the "License.")
 *
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0.
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS, WITHOUT
 * WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 *
 * See the License for the specific language governing permissions and limitations under the License.
 */

import { NativeModules, Platform, NativeEventEmitter } from 'react-native';
import { assertIssuer, assertClientId, assertRedirectUri } from '@okta/configuration-validation';
import { OktaAuth } from '@okta/okta-auth-js';
import Url from 'url-parse';
import { version, peerDependencies } from './package.json';

// eslint-disable-next-line camelcase
import jwt_decode from 'jwt-decode';

let authClient;

class OktaAuthError extends Error {
  constructor(code, message, detail) {
    super(message);

    this.code = code;
    this.detail = detail;
  }
}

class OktaStatusError extends Error {
  constructor(message, status) {
    super(message);

    this.status = status;
  }
}

export const createConfig = async({
  issuer,
  clientId,
  redirectUri, 
  endSessionRedirectUri, 
  discoveryUri,
  scopes,
  requireHardwareBackedKeyStore,
  androidChromeTabColor,
  httpConnectionTimeout,
  httpReadTimeout,
  browserMatchAll = false,
  oktaAuthConfig = {}
}) => {

  assertIssuer(discoveryUri);
  assertClientId(clientId);
  assertRedirectUri(redirectUri);
  assertRedirectUri(endSessionRedirectUri);

  const { origin } = new Url(discoveryUri);

  oktaAuthConfig = {
    ...oktaAuthConfig,
    issuer: issuer || origin,
    clientId,
    redirectUri,
    scopes
  };
  
  authClient = new OktaAuth(oktaAuthConfig);

  const reactNativeVersion = peerDependencies['react-native'];
  const userAgentTemplate = `okta-react-native/${version} $UPSTREAM_SDK react-native/${reactNativeVersion} ${Platform.OS}/${Platform.Version}`;
  
  if (authClient._oktaUserAgent) {
    authClient._oktaUserAgent.addEnvironment(userAgentTemplate.replace('$UPSTREAM_SDK ', ''));
  }

  httpConnectionTimeout = httpConnectionTimeout || 15;
  httpReadTimeout = httpReadTimeout || 10;

  if (Platform.OS === 'ios') {
    scopes = scopes.join(' ');

    return NativeModules.OktaSdkBridge.createConfig(
      clientId,
      redirectUri,
      endSessionRedirectUri,
      discoveryUri,
      scopes,
      userAgentTemplate,
      httpConnectionTimeout,
    );
  }

  const timeouts = {
    httpConnectionTimeout,
    httpReadTimeout,
  };
    
  return NativeModules.OktaSdkBridge.createConfig(
    clientId,
    redirectUri,
    endSessionRedirectUri,
    discoveryUri,
    scopes,
    userAgentTemplate,
    requireHardwareBackedKeyStore,
    androidChromeTabColor,
    timeouts,
    browserMatchAll,
  );
}; 

export const getAuthClient = () => {
  if (!authClient) {
    throw new OktaAuthError(
      '-100', 
      'OktaOidc client isn\'t configured, check if you have created a configuration with createConfig'
    );
  }
  return authClient;
};

export const signIn = async(options) => {
  // Custom sign in
  if (options && typeof options === 'object') {
    return getAuthClient().signIn(options)
      .then((transaction) => {
        const { status, sessionToken } = transaction;
        if (status !== 'SUCCESS') {
          throw new OktaStatusError(
            'Transaction status other than "SUCCESS" has been returned. Check transaction.status and handle accordingly.', 
            status
          );
        } 

        return authenticate({ sessionToken });
      })
      .then(token => {
        if (!token) {
          throw new Error('Failed to get accessToken');
        }

        return token;
      })
      .catch(error => {
        throw new OktaAuthError('-1000', 'Sign in was not authorized', error);
      });
  }

  // Browser sign in - Legacy support for non breaking.
  return signInWithBrowser();
};

export const signInWithBrowser = async(options = {}) => {
  if (typeof options.noSSO === 'boolean') { 
    options.noSSO = options.noSSO.toString(); 
  }

  return NativeModules.OktaSdkBridge.signIn(options);
};

export const signOut = async() => {
  return NativeModules.OktaSdkBridge.signOut();
};

export const authenticate = async({sessionToken}) => {
  return NativeModules.OktaSdkBridge.authenticate(sessionToken);
};

export const getAccessToken = async() => {
  return NativeModules.OktaSdkBridge.getAccessToken();
};

export const getIdToken = async() => {
  return NativeModules.OktaSdkBridge.getIdToken();
};

export const getUser = async() => {
  return NativeModules.OktaSdkBridge.getUser()
    .then(data => {
      if (typeof data === 'string') {
        try {
          return JSON.parse(data);
        } catch (e) {
          throw new OktaAuthError('-600', 'Okta Oidc error', e);
        }
      }

      return data;
    });
};

export const getUserFromIdToken = async() => {
  let idTokenResponse = await getIdToken();
  return jwt_decode(idTokenResponse.id_token);
};

export const isAuthenticated = async() => {
  return NativeModules.OktaSdkBridge.isAuthenticated();
};

export const revokeAccessToken = async() => {
  return NativeModules.OktaSdkBridge.revokeAccessToken();
};

export const revokeIdToken = async() => {
  return NativeModules.OktaSdkBridge.revokeIdToken();
};

export const revokeRefreshToken = async() => {
  return NativeModules.OktaSdkBridge.revokeRefreshToken();
};

export const introspectAccessToken = async() => {
  return NativeModules.OktaSdkBridge.introspectAccessToken(); 
};

export const introspectIdToken = async() => {
  return NativeModules.OktaSdkBridge.introspectIdToken(); 
};

export const introspectRefreshToken = async() => {
  return NativeModules.OktaSdkBridge.introspectRefreshToken(); 
};

export const refreshTokens = async() => {
  return NativeModules.OktaSdkBridge.refreshTokens(); 
};

export const clearTokens = async() => {
  return NativeModules.OktaSdkBridge.clearTokens(); 
};

export const EventEmitter = new NativeEventEmitter(NativeModules.OktaSdkBridge);
