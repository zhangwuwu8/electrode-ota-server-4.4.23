import * as assert from "assert";

import { expect } from "chai";

import ElectrodeOtaDaoRdbms from "../src/ElectrodeOtaDaoRdbms";

import MyDAO from "./MyDAO";

import { clearTables } from "./ClearTables";

import {
  AppDTO,
  MetricInDTO,
  MetricOutDTO,
  MetricByStatusOutDTO,
  PackageDTO,
  UserDTO
} from "../src/dto";

import Encryptor from "../src/Encryptor";

import { readFileSync } from "fs";
import { version } from "punycode";

// tslint:disable:no-console

const dao = new ElectrodeOtaDaoRdbms();
const testDBConfig = {
  clusterConfig: {
    canRetry: true,
    defaultSelector: "ORDER",
    removeNodeErrorCount: 5,
    restoreNodeTimeout: 0
  },
  poolConfigs: [
    {
      database: "electrode_ota",
      host: "localhost",
      password: "ota",
      port: 33060,
      user: "ota"
    }
  ],
  encryptionConfig: {
    keyfile: "./test/sample_encryption.key",
    fields: [
      "user.name",
      "user.email",
      "package.released_by",
      "access_key.friendly_name",
      "access_key.description"
    ]
  }
};

const stageDeploymentKey = "qjPVRyntQQrKJhkkNbVJeULhAIfVtHaBDfCFggzL";
const intlStageDeploymentKey = "aoh0u3u9u0uoihaoshdfhh9842234Fdkap30";
const prodDeploymentKey = "PutMeonDyCkrSQWnbOqFnawEAwRteuxCZPeGhshl";
const STAGING = "Staging";
const INTLSTAGING = "IntlStaging";
const PROD = "Production";
const packageHash =
  "0848a9900dc54d5e88c90d39a7454b1b64a3557b337b9dadf6c20de5ed305182";

let appId = 0;
const appName = "testApp";
let pkgId = 0;
// tslint:disable:no-unused-expression

process.on("unhandledRejection", (reason, p) => {
  console.log("Unhandled Rejection, reason:", reason);
});

// tslint:disable-next-line:only-arrow-functions
describe("Data Access via RDBMS", function() {
  this.timeout(30000);

  describe("connect", () => {
    it("connects to the database", () => {
      return dao.connect(testDBConfig).then(() => dao.close());
    });
  });

  describe("close", () => {
    it("closes the cluster", () => {
      return dao.close();
    });
  });

  describe("dao methods", () => {
    const email = "test@tests.com";

    before(() => {
      return dao.connect(testDBConfig).then(() => {
        return dao.getConnection().then(connection => clearTables(connection));
      });
    });

    after(() => {
      return dao.close();
    });

    describe("user-related methods", () => {
      const userDTO = new UserDTO();
      const createdTime = Date.now();
      const expires = createdTime + 60 * 24 * 3600 * 1000;
      const keyName = "02f20n02n303n";
      const newKeyName = "2930jf920j02j";
      userDTO.email = email;
      userDTO.name = "tester";
      userDTO.linkedProviders = ["ldap"];
      userDTO.accessKeys = {};
      userDTO.accessKeys[keyName] = {
        createdBy: undefined,
        createdTime,
        description: "Some junk",
        email: userDTO.email,
        expires,
        friendlyName: "Login-" + expires,
        id: "some junk",
        name: keyName
      };

      describe("createUser", () => {
        it("adds a user record and access key record to the respective tables", () => {
          return dao.createUser(userDTO).then(updatedUserDTO => {
            expect(updatedUserDTO).not.to.be.undefined;
            expect(updatedUserDTO.email).to.eq(userDTO.email);
            expect(updatedUserDTO.accessKeys).not.to.be.undefined;
            expect(updatedUserDTO.accessKeys[keyName]).not.to.be.undefined;
            expect(updatedUserDTO.accessKeys[keyName].expires.getTime()).to.eq(
              expires
            );
            expect(updatedUserDTO.linkedProviders).not.to.be.undefined;
            expect(updatedUserDTO.linkedProviders[0]).to.eq("ldap");
          });
        });

        it("throws an error if the email address for the user already exists", () => {
          return dao.createUser(userDTO).catch(err => {
            expect(err).not.to.be.undefined;
            expect(err.toString()).to.contain("already exists");
          });
        });

        it("can add a user without an access key or provider", () => {
          const differentUser = new UserDTO();
          differentUser.email = "stupid_face@smart_guy.com";
          differentUser.name = "Gim Gob";
          return dao.createUser(differentUser).then(created => {
            expect(created).not.to.be.undefined;
            expect(created.email).to.eq(differentUser.email);
            expect(created.name).to.eq(differentUser.name);
            expect(created.accessKeys).to.be.undefined;
            expect(created.linkedProviders).to.be.undefined;
          });
        });

        it("can handle expiration on keys as Date's instead of numbers", () => {
          const anotherUser = new UserDTO();
          anotherUser.email = "another@test_user.com";
          anotherUser.name = "Bob Diggety";
          const testKey = "2930jf02j023j02j2f";
          const testExpiration = new Date();
          const testLastAccess = new Date();
          anotherUser.accessKeys = {};
          anotherUser.accessKeys[testKey] = {
            createdBy: undefined,
            createdTime,
            description: "Some junk",
            email: userDTO.email,
            expires: testExpiration,
            friendlyName: "Login-" + expires,
            id: "some junk",
            lastAccess: testLastAccess,
            name: testKey
          };

          return dao.createUser(anotherUser).then(created => {
            expect(created).not.to.be.undefined;
            expect(created.email).to.eq(anotherUser.email);
            expect(created.name).to.eq(anotherUser.name);
            expect(created.accessKeys).not.to.be.undefined;
            expect(created.accessKeys[testKey]).not.to.be.undefined;
            const createdKey = created.accessKeys[testKey];
            const accessKey = anotherUser.accessKeys[testKey];
            expect(createdKey.expires.getTime()).to.eq(
              accessKey.expires.getTime()
            );
          });
        });
      });

      describe("userByEmail", () => {
        it("returns the user specified by email address", () => {
          return dao.userByEmail(userDTO.email).then(found => {
            userDTO.id = found.id;
            expect(found).not.to.be.undefined;
            expect(found.email).to.eq(userDTO.email);
            expect(found.accessKeys).not.to.be.undefined;
            expect(found.accessKeys[keyName]).not.to.be.undefined;
            expect(found.accessKeys[keyName].expires.getTime()).to.eq(expires);
          });
        });

        it("will throw an error if user not found", () => {
          return dao.userByEmail("some-other@email.com").catch(err => {
            expect(err).not.to.be.undefined;
            expect(err.toString()).to.contain("No user found");
          });
        });
      });

      describe("userByAccessKey", () => {
        it("returns the user specified by access key", () => {
          return dao.userByAccessKey(keyName).then(found => {
            expect(found).not.to.be.undefined;
            expect(found.email).to.eq(userDTO.email);
            expect(found.accessKeys).not.to.be.undefined;
            expect(found.accessKeys[keyName]).not.to.be.undefined;
          });
        });

        it("will throw an error if user not found", () => {
          return dao.userByAccessKey("someJunk").catch(err => {
            expect(err).not.to.be.undefined;
            expect(err.toString()).to.contain("No user found");
          });
        });
      });

      describe("userById", () => {
        it("returns the user specified by db id", () => {
          return dao.userById(userDTO.id + "").then(found => {
            expect(found).not.to.be.undefined;
            expect(found.email).to.eq(userDTO.email);
            expect(found.accessKeys).not.to.be.undefined;
            expect(found.accessKeys[keyName]).not.to.be.undefined;
          });
        });

        it("will throw an error if user not found", () => {
          return dao.userById("123456789").catch(err => {
            expect(err).not.to.be.undefined;
            expect(err.toString()).to.contain("No user found");
          });
        });
      });

      describe("updateUser", () => {
        it("will add a linked provider", () => {
          const updateInfo = new UserDTO();
          updateInfo.email = userDTO.email;
          updateInfo.accessKeys = userDTO.accessKeys;
          updateInfo.linkedProviders = ([] as string[]).concat(
            userDTO.linkedProviders,
            ["github"]
          );

          return dao.updateUser(userDTO.email, updateInfo).then(updated => {
            expect(updated).not.to.be.undefined;
            expect(updated.email).to.eq(userDTO.email);
            expect(updated.linkedProviders).not.to.be.undefined;
            expect(updated.linkedProviders.length).to.eq(2);
            expect(updated.linkedProviders.indexOf("ldap")).to.be.gte(0);
            expect(updated.linkedProviders.indexOf("github")).to.be.gte(0);
          });
        });

        it("updates an access key's last access, expiration, friendly name", () => {
          const updateInfo = new UserDTO();
          updateInfo.email = userDTO.email;
          updateInfo.accessKeys = {};
          updateInfo.accessKeys[keyName] = Object.assign(
            {},
            userDTO.accessKeys[keyName]
          );
          const newExpiration = Date.now() + 60 * 24 * 3600 * 1000;
          const newLastAccess = Date.now();
          const newFriendlyName = "Login-junk-junk-stuff";
          updateInfo.accessKeys[keyName].expires = newExpiration;
          updateInfo.accessKeys[keyName].friendlyName = newFriendlyName;
          updateInfo.accessKeys[keyName].lastAccess = newLastAccess;

          return dao.updateUser(userDTO.email, updateInfo).then(updated => {
            expect(updated).not.to.be.undefined;
            expect(updated.email).to.eq(userDTO.email);
            expect(updated.accessKeys).not.to.be.undefined;
            expect(updated.accessKeys[keyName]).not.to.be.undefined;
            const updatedAccessKey = updated.accessKeys[keyName];
            expect(updatedAccessKey.name).to.eq(
              userDTO.accessKeys[keyName].name
            );
            expect(updatedAccessKey.expires.getTime()).to.eq(newExpiration);
            expect(updatedAccessKey.lastAccess).not.to.be.undefined;
            if (updatedAccessKey.lastAccess) {
              expect(updatedAccessKey.lastAccess.getTime()).to.eq(
                newLastAccess
              );
            }
            expect(updatedAccessKey.friendlyName).to.eq(newFriendlyName);
            // so other tests will work right
            userDTO.accessKeys[keyName].friendlyName = newFriendlyName;
            userDTO.accessKeys[keyName].expires = newExpiration;
          });
        });

        it("can update only last access and leave expiration and friendly name unchanged", () => {
          const updateInfo = new UserDTO();
          updateInfo.email = userDTO.email;
          updateInfo.accessKeys = {};
          updateInfo.accessKeys[keyName] = Object.assign(
            {},
            userDTO.accessKeys[keyName]
          );
          const newExpiration = userDTO.accessKeys[keyName].expires;
          const newLastAccess = new Date();
          updateInfo.accessKeys[keyName].lastAccess = newLastAccess;
          delete updateInfo.accessKeys[keyName].friendlyName; // = undefined;
          delete updateInfo.accessKeys[keyName].expires; // = undefined;

          return dao.updateUser(userDTO.email, updateInfo).then(updated => {
            expect(updated).not.to.be.undefined;
            expect(updated.email).to.eq(userDTO.email);
            expect(updated.accessKeys).not.to.be.undefined;
            expect(updated.accessKeys[keyName]).not.to.be.undefined;
            const updatedAccessKey = updated.accessKeys[keyName];
            expect(updatedAccessKey.name).to.eq(
              userDTO.accessKeys[keyName].name
            );
            // tslint:disable-next-line:max-line-length
            expect(updatedAccessKey.expires.getTime()).to.eq(
              updateInfo.accessKeys[keyName].expires.getTime()
            );
            expect(updatedAccessKey.lastAccess).not.to.be.undefined;
            if (updatedAccessKey.lastAccess) {
              expect(updatedAccessKey.lastAccess.getTime()).to.eq(
                newLastAccess.getTime()
              );
            }
            userDTO.accessKeys[keyName].lastAccess = newLastAccess.getTime();
            expect(updatedAccessKey.friendlyName).to.eq(
              userDTO.accessKeys[keyName].friendlyName
            );
          });
        });

        it("can update only expires", () => {
          const updateInfo = new UserDTO();
          updateInfo.email = userDTO.email;
          updateInfo.accessKeys = {};
          updateInfo.accessKeys[keyName] = Object.assign(
            {},
            userDTO.accessKeys[keyName]
          );
          const newExpiration = userDTO.accessKeys[keyName].expires;
          updateInfo.accessKeys[keyName].expires = newExpiration;
          delete updateInfo.accessKeys[keyName].friendlyName;
          delete updateInfo.accessKeys[keyName].lastAccess;

          return dao.updateUser(userDTO.email, updateInfo).then(updated => {
            expect(updated).not.to.be.undefined;
            expect(updated.email).to.eq(userDTO.email);
            expect(updated.accessKeys).not.to.be.undefined;
            expect(updated.accessKeys[keyName]).not.to.be.undefined;
            const updatedAccessKey = updated.accessKeys[keyName];
            expect(updatedAccessKey.name).to.eq(
              userDTO.accessKeys[keyName].name
            );
            // tslint:disable-next-line:max-line-length
            expect(updatedAccessKey.expires.getTime()).to.eq(
              updateInfo.accessKeys[keyName].expires
            );
            expect(updatedAccessKey.lastAccess).not.to.be.undefined;
            if (updatedAccessKey.lastAccess) {
              expect(updatedAccessKey.lastAccess.getTime()).to.eq(
                userDTO.accessKeys[keyName].lastAccess
              );
            }
            expect(updatedAccessKey.friendlyName).to.eq(
              userDTO.accessKeys[keyName].friendlyName
            );
            userDTO.accessKeys[keyName].expires = newExpiration;
          });
        });

        it("adds a new access key", () => {
          const updateInfo = new UserDTO();
          updateInfo.email = userDTO.email;
          updateInfo.accessKeys = {};
          updateInfo.accessKeys[newKeyName] = {
            createdBy: undefined,
            createdTime,
            description: "Some junk 2",
            email: userDTO.email,
            expires,
            friendlyName: "Login-" + expires,
            id: "some junk",
            name: newKeyName
          };

          return dao.updateUser(userDTO.email, updateInfo).then(updated => {
            expect(updated).not.to.be.undefined;
            expect(updated.email).to.eq(userDTO.email);
            expect(updated.accessKeys).not.to.be.undefined;
            expect(updated.accessKeys[keyName]).not.to.be.undefined;
            expect(updated.accessKeys[keyName].name).to.eq(
              userDTO.accessKeys[keyName].name
            );
            expect(updated.accessKeys[newKeyName]).not.to.be.undefined;
            expect(updated.accessKeys[newKeyName].name).to.eq(
              updateInfo.accessKeys[newKeyName].name
            );
          });
        });

        it("will remove an access key", () => {
          const updateInfo = new UserDTO();
          updateInfo.email = userDTO.email;
          updateInfo.accessKeys = Object.assign({}, userDTO.accessKeys);
          delete updateInfo.accessKeys[newKeyName];

          return dao.updateUser(userDTO.email, updateInfo).then(updated => {
            expect(updated).not.to.be.undefined;
            expect(updated.email).to.eq(userDTO.email);
            expect(updated.accessKeys).not.to.be.undefined;
            expect(updated.accessKeys[keyName]).not.to.be.undefined;
            expect(updated.accessKeys[keyName].name).to.eq(
              userDTO.accessKeys[keyName].name
            );
            expect(updated.accessKeys[newKeyName]).to.be.undefined;
          });
        });

        it("will return existing if no changes sent", () => {
          const updateInfo = new UserDTO();
          updateInfo.email = userDTO.email;
          updateInfo.accessKeys = Object.assign({}, userDTO.accessKeys);

          return dao.updateUser(userDTO.email, updateInfo).then(updated => {
            expect(updated).not.to.be.undefined;
            expect(updated.email).to.eq(userDTO.email);
            expect(updated.accessKeys).not.to.be.undefined;
            expect(updated.accessKeys[keyName]).not.to.be.undefined;
            expect(updated.accessKeys[keyName].name).to.eq(
              userDTO.accessKeys[keyName].name
            );
          });
        });

        it("will throw an error if user not found", () => {
          const updateInfo = new UserDTO();
          updateInfo.accessKeys = {};
          return dao.updateUser("someJunk@stuff.com", updateInfo).catch(err => {
            expect(err).not.to.be.undefined;
            expect(err.toString()).to.contain("No user found");
          });
        });

        it("will throw an error if incoming accessKeys property is null", () => {
          const updateInfo = new UserDTO();
          return dao.updateUser("someJunk@stuff.com", updateInfo).catch(err => {
            expect(err).not.to.be.undefined;
            expect(err.toString()).to.contain(
              "accessKeys property must be provided"
            );
          });
        });
      });
    });

    describe("app-related methods", () => {
      const appDTO = new AppDTO();
      appDTO.name = appName;
      const permission = "Owner";
      appDTO.collaborators = {};
      appDTO.deployments = {};

      describe("createApp", () => {
        it("will throw an error if creating an app with no owner", () => {
          return dao.createApp(appDTO).catch(err => {
            expect(err).not.to.be.undefined;
            expect(err.toString()).to.contain("app.collaborators");
          });
        });

        it("will throw an error if creating an app with unknown owner", () => {
          const junkEmail = "some_junk@email.com";
          appDTO.collaborators[junkEmail] = { permission };
          return dao.createApp(appDTO).catch(err => {
            expect(err).not.to.be.undefined;
            expect(err.toString()).to.contain("not found");
            delete appDTO.collaborators[junkEmail];
          });
        });

        it("will create an app record with permissions and deployments", () => {
          appDTO.collaborators[email] = { permission };
          appDTO.deployments[STAGING] = {
            key: stageDeploymentKey,
            name: STAGING
          };
          appDTO.deployments[PROD] = {
            key: prodDeploymentKey,
            name: PROD
          };

          return dao.createApp(appDTO).then(updated => {
            appDTO.id = updated.id;
            // for use in other "defines" that need an app
            appId = updated.id;
            expect(updated).not.to.be.undefined;
            expect(updated.name).to.eq(appName);
            expect(updated.collaborators).not.to.be.undefined;
            expect(updated.collaborators[email]).not.to.be.undefined;
            expect(updated.collaborators[email].permission).to.eq(permission);
            expect(updated.deployments).not.to.be.undefined;
            expect(updated.deployments).to.contain(STAGING);
            expect(updated.deployments).to.contain(PROD);
          });
        });

        it("can create an app without deployments", () => {
          const differentApp = new AppDTO();
          differentApp.name = "DifferentApp-Android";
          differentApp.collaborators = {};
          differentApp.collaborators[email] = { permission };

          return dao.createApp(differentApp).then(updated => {
            expect(updated).not.to.be.undefined;
            expect(updated.name).to.eq(differentApp.name);
            expect(updated.collaborators).not.to.be.undefined;
            expect(updated.collaborators[email]).not.to.be.undefined;
            expect(updated.collaborators[email].permission).to.eq(permission);
          });
        });
      });

      describe("appById", () => {
        it("will return the base app info", () => {
          // return dao.appById()
        });

        it("will throw an error if app not found", () => {
          return dao.appById(-1).catch(err => {
            expect(err).not.to.be.undefined;
            expect(err.toString()).to.contain("not found");
          });
        });
      });

      describe("appsForCollaborator", () => {
        it("will retrieve all the apps for a user email", () => {
          return dao.appsForCollaborator(email).then(apps => {
            expect(apps).not.to.be.undefined;
            expect(apps.length).to.be.gt(0);
            expect(apps[0].name).not.to.be.undefined;
            expect(apps[0].collaborators).not.to.be.undefined;
            expect(apps[0].collaborators[email]).not.to.be.undefined;
            expect(apps[0].collaborators[email].permission).to.be.oneOf([
              "Owner",
              "Collaborator"
            ]);
          });
        });
      });

      describe("appForCollaborator", () => {
        it("will retrieve the app for the app name and collaborator email", () => {
          return dao.appForCollaborator(email, appName).then(app => {
            expect(app).not.to.be.undefined;
            if (app) {
              expect(app.name).not.to.be.undefined;
              expect(app.collaborators).not.to.be.undefined;
              expect(app.collaborators[email]).not.to.be.undefined;
              expect(app.collaborators[email].permission).to.be.oneOf([
                "Owner",
                "Collaborator"
              ]);
              expect(app.deployments).not.to.be.undefined;
              expect(app.deployments).to.contain(STAGING);
              expect(app.deployments).to.contain(PROD);
            }
          });
        });

        it("will throw a Not Found error if the app is not found", () => {
          return dao
            .appForCollaborator(email, "someOtherStupidAppName")
            .catch(err => {
              expect(err).not.to.be.undefined;
              expect(err.toString()).to.contain("Not Found");
            });
        });
      });

      describe("updateApp", () => {
        const collabAccessKey = "23490820jf02j0cj2";
        const expires = Date.now() + 24 * 60 * 60 * 1000;
        const collaborator = new UserDTO();
        collaborator.email = "collab@collab.net";
        collaborator.linkedProviders = ["ldap"];
        collaborator.accessKeys = {};
        collaborator.accessKeys[collabAccessKey] = {
          createdBy: undefined,
          createdTime: Date.now(),
          description: "Some junk 2",
          email: collaborator.email,
          expires,
          friendlyName: "Login-" + expires,
          id: "some junk",
          name: collabAccessKey
        };

        before(() => {
          // let's add another user to be a collaborator
          return dao.createUser(collaborator);
        });

        it("can rename an app", () => {
          const updateInfo = new AppDTO();
          const newAppName = "newTestAppName";
          updateInfo.id = appDTO.id;
          updateInfo.name = newAppName;

          return dao.updateApp(appDTO.id, updateInfo).then(updated => {
            expect(updated).not.to.be.undefined;
            expect(updated.name).to.eq(newAppName);
            expect(updated.collaborators).not.to.be.undefined;
            expect(updated.collaborators[email]).not.to.be.undefined;
            appDTO.name = newAppName;
          });
        });

        it("can add a collaborator", () => {
          const updateInfo = new AppDTO();
          updateInfo.name = appDTO.name;
          updateInfo.collaborators = {};
          updateInfo.collaborators[email] = { permission: "Owner" };
          updateInfo.collaborators[collaborator.email] = {
            permission: "Collaborator"
          };
          return dao.updateApp(appDTO.id, updateInfo).then(updated => {
            expect(updated).not.to.be.undefined;
            expect(updated.name).to.eq(appDTO.name);
            expect(updated.collaborators).not.to.be.undefined;
            expect(updated.collaborators[email]).not.to.be.undefined;
            expect(updated.collaborators[email].permission).to.eq("Owner");
            expect(updated.collaborators[collaborator.email]).not.to.be
              .undefined;
            expect(updated.collaborators[collaborator.email].permission).to.eq(
              "Collaborator"
            );

            return dao.appsForCollaborator(email).then(apps => {
              expect(apps).not.to.be.undefined;
              expect(apps.length).to.be.gte(0);
              expect(apps[0].collaborators).not.to.be.undefined;
              expect(apps[0].collaborators[email]).not.to.be.undefined;
              expect(apps[0].collaborators[collaborator.email]).not.to.be
                .undefined;
            });
          });
        });

        it("can remove a collaborator", () => {
          const updateInfo = new AppDTO();
          updateInfo.name = appDTO.name;
          updateInfo.collaborators = {};
          updateInfo.collaborators[email] = { permission: "Owner" };
          return dao.updateApp(appDTO.id, updateInfo).then(updated => {
            expect(updated).not.to.be.undefined;
            expect(updated.name).to.eq(appDTO.name);
            expect(updated.collaborators).not.to.be.undefined;
            expect(updated.collaborators[email]).not.to.be.undefined;
            expect(updated.collaborators[email].permission).to.eq("Owner");
            expect(updated.collaborators[collaborator.email]).to.be.undefined;
          });
        });

        it("can transfer app ownership", () => {
          const updateInfo = new AppDTO();
          updateInfo.name = appDTO.name;
          updateInfo.collaborators = {};
          updateInfo.collaborators[email] = { permission: "Collaborator" };
          updateInfo.collaborators[collaborator.email] = {
            permission: "Owner"
          };
          return dao.updateApp(appDTO.id, updateInfo).then(updated => {
            expect(updated).not.to.be.undefined;
            expect(updated.name).to.eq(appDTO.name);
            expect(updated.collaborators).not.to.be.undefined;
            expect(updated.collaborators[email]).not.to.be.undefined;
            expect(updated.collaborators[email].permission).to.eq(
              "Collaborator"
            );
            expect(updated.collaborators[collaborator.email]).not.to.be
              .undefined;
            expect(updated.collaborators[collaborator.email].permission).to.eq(
              "Owner"
            );

            updateInfo.collaborators[email] = { permission: "Owner" };
            updateInfo.collaborators[collaborator.email] = {
              permission: "Collaborator"
            };
            return dao.updateApp(appDTO.id, updateInfo).then(reverted => {
              expect(reverted).not.to.be.undefined;
              expect(reverted.name).to.eq(appDTO.name);
              expect(reverted.collaborators).not.to.be.undefined;
              expect(reverted.collaborators[email]).not.to.be.undefined;
              expect(reverted.collaborators[email].permission).to.eq("Owner");
              expect(reverted.collaborators[collaborator.email]).not.to.be
                .undefined;
              expect(
                reverted.collaborators[collaborator.email].permission
              ).to.eq("Collaborator");
            });
          });
        });

        it("will return the existing app if no changes are provided", () => {
          const updateInfo = new AppDTO();
          updateInfo.name = appDTO.name;
          updateInfo.collaborators = {};
          updateInfo.collaborators[email] = { permission: "Owner" };

          // first update will effectively delete the collaborator created in the last test
          return dao.updateApp(appDTO.id, updateInfo).then(updated => {
            expect(updated).not.to.be.undefined;
            expect(updated.name).to.eq(appDTO.name);
            expect(updated.collaborators).not.to.be.undefined;
            expect(updated.collaborators[email]).not.to.be.undefined;
            expect(updated.collaborators[email].permission).to.eq("Owner");

            return dao.updateApp(appDTO.id, updateInfo).then(unchanged => {
              expect(unchanged).not.to.be.undefined;
              expect(unchanged.name).to.eq(appDTO.name);
              expect(unchanged.collaborators).not.to.be.undefined;
              expect(unchanged.collaborators[email]).not.to.be.undefined;
              expect(unchanged.collaborators[email].permission).to.eq("Owner");
            });
          });
        });
      });

      describe("appForDeploymentKey", () => {
        it("throws an error if no apps are found", () => {
          return dao.appForDeploymentKey("SomeRandomJunk").catch(err => {
            expect(err).not.to.be.undefined;
            expect(err.toString()).to.contain("Not found");
          });
        });

        it("searches for and finds an app record for a given deployment key", () => {
          return dao.appForDeploymentKey(stageDeploymentKey).then(app => {
            expect(app).not.to.be.undefined;
            expect(app.id).to.eq(appId);
            expect(app.name).not.to.be.undefined;
            expect(app.collaborators).not.to.be.undefined;
            expect(app.collaborators[email]).not.to.be.undefined;
            expect(app.collaborators[email].permission).to.be.oneOf([
              "Owner",
              "Collaborator"
            ]);
            expect(app.deployments).not.to.be.undefined;
            expect(app.deployments).to.contain(STAGING);
            expect(app.deployments).to.contain(PROD);
          });
        });
      });
    });

    describe("deployment-related methods", () => {
      const myDeploymentName = "MyDeployment";
      const myDeploymentKey = "19fj29j2j302f923";
      const newDeplName = "MyNewDeploymentName";

      describe("addDeployment", () => {
        it("will fail if the deployment key already exists", () => {
          return dao
            .addDeployment(appId, STAGING, { key: stageDeploymentKey })
            .catch(err => {
              expect(err).not.to.be.undefined;
              expect(err.toString()).to.contain("already exists");
            });
        });

        it("adds a new deployment", () => {
          return dao
            .addDeployment(appId, myDeploymentName, { key: myDeploymentKey })
            .then(deployment => {
              expect(deployment).not.to.be.undefined;
              expect(deployment.key).to.eq(myDeploymentKey);
              expect(deployment.name).to.eq(myDeploymentName);
            });
        });
      });

      describe("deploymentForKey", () => {
        it("will throw an error if the deployment is not found", () => {
          return dao.deploymentForKey("SomeOldJunkKey").catch(err => {
            expect(err).not.to.be.undefined;
            expect(err.toString()).to.contain("Not found");
          });
        });

        it("will find and return the deployment for the given key", () => {
          return dao.deploymentForKey(stageDeploymentKey).then(deployment => {
            expect(deployment).not.to.be.undefined;
            expect(deployment.key).to.eq(stageDeploymentKey);
            expect(deployment.name).to.eq(STAGING);
          });
        });
      });

      describe("deploymentsByApp", () => {
        it("will throw an error if the deployment is not found", () => {
          return dao
            .deploymentsByApp(appId, ["StuffKey", "ThingKey"])
            .catch(err => {
              expect(err).not.to.be.undefined;
              expect(err.toString()).to.contain("Not found");
            });
        });

        it("will find and return the deployments for given app id and key names", () => {
          return dao
            .deploymentsByApp(appId, [STAGING, myDeploymentName])
            .then(deployments => {
              expect(deployments).not.to.be.undefined;
              expect(deployments[STAGING]).not.to.be.undefined;
              expect(deployments[STAGING].key).to.eq(stageDeploymentKey);
              expect(deployments[myDeploymentName]).not.to.be.undefined;
              expect(deployments[myDeploymentName].key).to.eq(myDeploymentKey);
            });
        });
      });

      describe("deploymentByApp", () => {
        it("will throw an error if the deployment is not found", () => {
          return dao.deploymentByApp(appId, "SomeOldJunkKey").catch(err => {
            expect(err).not.to.be.undefined;
            expect(err.toString()).to.contain("Not found");
          });
        });

        it("will find and return the deployment for the given app id and deployment name", () => {
          return dao
            .deploymentByApp(appId, myDeploymentName)
            .then(deployment => {
              expect(deployment).not.to.be.undefined;
              expect(deployment.key).to.eq(myDeploymentKey);
              expect(deployment.name).to.eq(myDeploymentName);
            });
        });
      });

      describe("renameDeployment", () => {
        it("will throw an error if the old deployment name is not found", () => {
          return dao
            .renameDeployment(appId, "somejunk", "someNewJunk")
            .catch(err => {
              expect(err).not.to.be.undefined;
              expect(err.toString()).to.contain("Not found");
            });
        });

        it("will update the deployment name", () => {
          return dao
            .renameDeployment(appId, myDeploymentName, newDeplName)
            .then(() => {
              return dao.deploymentForKey(myDeploymentKey).then(deployment => {
                expect(deployment).not.to.be.undefined;
                expect(deployment.name).to.eq(newDeplName);
                expect(deployment.key).to.eq(myDeploymentKey);
              });
            });
        });
      });

      describe("removeDeployment", () => {
        it("will throw an error if the deployment name is not found", () => {
          return dao.removeDeployment(appId, "some junk").catch(err => {
            expect(err).not.to.be.undefined;
            expect(err.toString()).to.contain("Not found");
          });
        });

        it("will remove the deployment", () => {
          return dao.removeDeployment(appId, newDeplName).then(() => {
            return dao.deploymentForKey(myDeploymentKey).catch(err => {
              expect(err).not.to.be.undefined;
              expect(err.toString()).to.contain("Not found");
            });
          });
        });
      });
    });

    describe("package-related methods", () => {
      const pkg = new PackageDTO();
      pkg.appVersion = "0.0.1";
      pkg.blobUrl = "http://stuff.com/pkg...";
      pkg.description = "my new uploaded package";
      pkg.isDisabled = false;
      pkg.isMandatory = false;
      pkg.label = "v1";
      pkg.manifestBlobUrl = "http://stuff.com/manifest...";
      pkg.packageHash = packageHash;
      pkg.releasedBy = "testUser";
      pkg.releaseMethod = "Upload";
      pkg.rollout = 100;
      pkg.size = 12908201;
      let newPkgId = 0;

      describe("addPackage", () => {
        it("will throw an error if the given deployment key is not foud", () => {
          return dao.addPackage("SomeJunkKey", new PackageDTO()).catch(err => {
            expect(err).not.to.be.undefined;
            expect(err.toString()).to.contain("Not found");
          });
        });

        it("creates a new package for a deployment", () => {
          return dao.addPackage(stageDeploymentKey, pkg).then(updated => {
            expect(updated).not.to.be.undefined;
            expect(updated.appVersion).to.eq(pkg.appVersion);
            expect(updated.blobUrl).to.eq(pkg.blobUrl);
            expect(updated.created_).not.to.be.undefined;
            expect(updated.description).to.eq(pkg.description);
            expect(updated.id).not.to.be.undefined;
            pkg.id = updated.id;
            // for use in other tests
            pkgId = pkg.id;
            expect(updated.isDisabled).to.eq(pkg.isDisabled);
            expect(updated.isMandatory).to.eq(pkg.isMandatory);
            expect(updated.label).to.eq(pkg.label);
            expect(updated.manifestBlobUrl).to.eq(pkg.manifestBlobUrl);
            expect(updated.packageHash).to.eq(pkg.packageHash);
            expect(updated.releasedBy).to.eq(pkg.releasedBy);
            expect(updated.releaseMethod).to.eq(pkg.releaseMethod);
            expect(updated.rollout).to.eq(pkg.rollout);
            expect(updated.size).to.eq(pkg.size);
          });
        });

        it("will add tags on creation", () => {
          const tags = ["TAG-1", "TAG-2"];
          const newPkg = new PackageDTO();
          Object.assign(newPkg, pkg);
          newPkg.id = 0;
          newPkg.tags = tags;
          return dao.addPackage(stageDeploymentKey, newPkg).then(updated => {
            expect(updated).not.to.be.undefined;
            newPkg.id = updated.id;
            newPkgId = updated.id;
            expect(updated.tags).to.deep.equal(tags);
          });
        });
      });

      describe("packageById", () => {
        it("will throw an error if the given package id is not found", () => {
          return dao.packageById(-100).catch(err => {
            expect(err).not.to.be.undefined;
            expect(err.toString()).to.contain("Not found");
          });
        });

        it("retrieves the package for the given id", () => {
          return dao.packageById(pkg.id).then(found => {
            expect(found).not.to.be.undefined;
            expect(found.appVersion).to.eq(pkg.appVersion);
            expect(found.blobUrl).to.eq(pkg.blobUrl);
            expect(found.created_).not.to.be.undefined;
            expect(found.description).to.eq(pkg.description);
            expect(found.id).to.eq(pkg.id);
            expect(found.isDisabled).to.eq(pkg.isDisabled);
            expect(found.isMandatory).to.eq(pkg.isMandatory);
            expect(found.label).to.eq(pkg.label);
            expect(found.manifestBlobUrl).to.eq(pkg.manifestBlobUrl);
            expect(found.packageHash).to.eq(pkg.packageHash);
            expect(found.releasedBy).to.eq(pkg.releasedBy);
            expect(found.releaseMethod).to.eq(pkg.releaseMethod);
            expect(found.rollout).to.eq(pkg.rollout);
            expect(found.size).to.eq(pkg.size);
          });
        });

        it("includes tags for a package if they are available", () => {
          return dao.packageById(newPkgId).then(found => {
            expect(found).not.to.be.undefined;
            expect(found.appVersion).to.eq(pkg.appVersion);
            expect(found.blobUrl).to.eq(pkg.blobUrl);
            expect(found.created_).not.to.be.undefined;
            expect(found.description).to.eq(pkg.description);
            expect(found.id).to.eq(newPkgId);
            expect(found.isDisabled).to.eq(pkg.isDisabled);
            expect(found.isMandatory).to.eq(pkg.isMandatory);
            expect(found.label).to.eq(pkg.label);
            expect(found.manifestBlobUrl).to.eq(pkg.manifestBlobUrl);
            expect(found.packageHash).to.eq(pkg.packageHash);
            expect(found.releasedBy).to.eq(pkg.releasedBy);
            expect(found.releaseMethod).to.eq(pkg.releaseMethod);
            expect(found.rollout).to.eq(pkg.rollout);
            expect(found.size).to.eq(pkg.size);
            expect(found.tags).not.to.be.undefined;
            if (found.tags) {
              expect(found.tags.length > 0);
              expect(found.tags).to.contain("TAG-1");
              expect(found.tags).to.contain("TAG-2");
            }
          });
        });
      });

      describe("updatePackage", () => {
        it("will throw an error if the deployment key is not found", () => {
          return dao.updatePackage("SomeJunkKey", {}, "").catch(err => {
            expect(err).not.to.be.undefined;
            expect(err.toString()).to.contain("Not found");
          });
        });

        it("will throw an error if there is no deployment package history", () => {
          return dao.updatePackage(prodDeploymentKey, {}, "").catch(err => {
            expect(err).not.to.be.undefined;
            expect(err.toString()).to.contain("Not found");
          });
        });

        it("will update a few key fields for a package", () => {
          const updateInfo = {
            appVersion: "0.0.3",
            description: "NewDescriptio for this package",
            isDisabled: true,
            isMandatory: true,
            rollout: 94
          };

          return dao
            .updatePackage(stageDeploymentKey, updateInfo, "")
            .then(updated => {
              expect(updated).not.to.be.undefined;
              expect(updated.appVersion).to.eq(updateInfo.appVersion);
              expect(updated.description).to.eq(updateInfo.description);
              expect(updated.isDisabled).to.eq(updateInfo.isDisabled);
              expect(updated.isMandatory).to.eq(updated.isMandatory);
              expect(updated.rollout).to.eq(updated.rollout);

              expect(updated.blobUrl).to.eq(pkg.blobUrl);
              expect(updated.label).to.eq(pkg.label);
              expect(updated.manifestBlobUrl).to.eq(pkg.manifestBlobUrl);
              expect(updated.packageHash).to.eq(pkg.packageHash);
              expect(updated.releasedBy).to.eq(pkg.releasedBy);
              expect(updated.releaseMethod).to.eq(pkg.releaseMethod);
              expect(updated.size).to.eq(pkg.size);
            });
        });

        it("will update a specific package if the package id is in package info", () => {
          return dao.deploymentForKey(stageDeploymentKey).then((dep) => {
            // We assert that the latest package in the deployment has a version of 0.0.3
            expect(dep.package).to.not.be.undefined;
            expect(dep.package.appVersion).to.equal("0.0.3");
            return dao.history(appId, STAGING).then((hist) => {
              // We also assert that there are 2 packages in this deployment
              // If we pass the id in the update info, it should update that package
              // NOT the latest package in the deployment.
              expect(hist.length).to.equal(2);
              expect(hist[1].description).to.equal("my new uploaded package");
              const updateInfo = {
                appVersion: "0.0.1",
                description: "One for All",
                id: hist[1].id,
                isDisabled: true,
                isMandatory: true,
                rollout: 94,
              };
              return dao.updatePackage(stageDeploymentKey, updateInfo, "").then((updated) => {
                expect(updated).to.not.be.undefined;
                return dao.history(appId, STAGING).then((updatedHist) => {
                  expect(updatedHist[0].appVersion).to.equal("0.0.3");
                  expect(updatedHist[1].appVersion).to.equal("0.0.1");
                  expect(updatedHist[1].description).to.equal("One for All");
                });
              });
            });
          });
        });

        it("will add and/or remove diffPackageMaps", () => {
          // create a new package
          const newPkgHash = "2390f29j2jf892hf92n289nc29";
          const newPkg = new PackageDTO();
          Object.assign(newPkg, pkg);
          newPkg.packageHash = newPkgHash;

          const diffPackageMap: any = {};
          diffPackageMap[newPkgHash] = {
            size: 144103903,
            url: "http://stuff.com/afoi320..."
          };

          const updateInfo = {
            diffPackageMap
          };

          return dao.addPackage(stageDeploymentKey, newPkg).then(result => {
            // adding
            return dao
              .updatePackage(stageDeploymentKey, updateInfo, "")
              .then(updated => {
                expect(updated).not.to.be.undefined;
                expect(updated.blobUrl).to.eq(pkg.blobUrl);
                expect(updated.label).to.eq(pkg.label);
                expect(updated.manifestBlobUrl).to.eq(pkg.manifestBlobUrl);
                expect(updated.packageHash).to.eq(newPkgHash);
                expect(updated.releasedBy).to.eq(pkg.releasedBy);
                expect(updated.releaseMethod).to.eq(pkg.releaseMethod);
                expect(updated.size).to.eq(pkg.size);

                expect(updated.diffPackageMap).not.to.be.undefined;
                expect(updated.diffPackageMap[newPkgHash]).not.to.be.undefined;
                expect(updated.diffPackageMap[newPkgHash].size).to.eq(
                  diffPackageMap[newPkgHash].size
                );
                expect(updated.diffPackageMap[newPkgHash].url).to.eq(
                  diffPackageMap[newPkgHash].url
                );

                // removing
                delete updateInfo.diffPackageMap[newPkgHash];
                return dao
                  .updatePackage(stageDeploymentKey, updateInfo, "")
                  .then(postRemoval => {
                    expect(postRemoval).not.to.be.undefined;
                    expect(postRemoval.diffPackageMap).not.to.be.undefined;
                    expect(postRemoval.diffPackageMap[newPkgHash]).to.be
                      .undefined;
                  });
              });
          });
        });

        it("will add and/or remove tags", () => {
          const newPkg = new PackageDTO();
          Object.assign(newPkg, pkg);

          return dao.addPackage(stageDeploymentKey, newPkg).then(() => {
            const tags = ["TAG-1", "TAG-2", "TAG-3"];
            const updateInfo = {
              tags
            };
            return dao
              .updatePackage(stageDeploymentKey, updateInfo, "")
              .then(updated => {
                expect(updated).not.to.be.undefined;
                expect(updated.tags).not.to.be.undefined;
                if (updated.tags) {
                  tags.forEach(tag => {
                    expect(updated.tags).to.contain(tag);
                  });
                }

                updateInfo.tags.push("TAGS-4");

                // let's add some more tags
                return dao
                  .updatePackage(stageDeploymentKey, updateInfo, "")
                  .then(moreTags => {
                    expect(moreTags).not.to.be.undefined;
                    expect(moreTags.tags).not.to.be.undefined;
                    if (moreTags.tags) {
                      updateInfo.tags.forEach(tag => {
                        expect(moreTags.tags).to.contain(tag);
                      });
                    }

                    // let's remove them
                    const nextUpdateInfo = {
                      tags: []
                    };

                    return dao
                      .updatePackage(stageDeploymentKey, nextUpdateInfo, "")
                      .then(nextUpdated => {
                        expect(nextUpdated).not.to.be.undefined;
                        expect(nextUpdated.tags).to.be.undefined;
                      });
                  });
              });
          });
        });
      });

      describe("addPackageDiffMap", () => {
        const appId = 432;
        const deployKey = "qFOiefKJFOIJNkldsjfiuhgbojFIOWFBDfCFggzL"
        const pkgOne = new PackageDTO();
        pkgOne.appVersion = "1.0.0";
        pkgOne.blobUrl = "http://stuff.com/package2/...";
        pkgOne.manifestBlobUrl = "http://stuff.com/manifest2/..";
        pkgOne.packageHash = "jnowfim20m3@@#%FMM@FK@K";
        pkgOne.isDisabled = false;
        pkgOne.isMandatory = false;
        pkgOne.label = "v1";
        pkgOne.rollout = 100;
        pkgOne.size = 1600;
        pkgOne.releaseMethod = "Upload";
        pkgOne.releasedBy = email;
        const pkgTwo = new PackageDTO();
        Object.assign(pkgTwo, pkgOne);
        pkgTwo.appVersion = "1.0.0";
        pkgTwo.packageHash = "oiwjfriefjkjbgniohwef";
        pkgTwo.label = "v2";

        before(() => {
          return dao.addDeployment(appId, STAGING, { key: deployKey })
        })
        it("adds package diff", () => {
          let pkgId: number = 0;
          const newDiff = {
                size: 1838934,
                url: "http://example.com/dowldkfj.."
          }
          return dao.addPackage(deployKey, pkgOne)
            .then(() => dao.addPackage(deployKey, pkgTwo))
            .then((savedPkg) => {
              pkgId = savedPkg.id;
              savedPkg.diffPackageMap = {[pkgOne.packageHash]:newDiff};
              return dao.addPackageDiffMap(stageDeploymentKey, savedPkg, pkgOne.packageHash)
            })
            .then(() => dao.packageById(pkgId))
            .then((pkg) => {
              expect(pkg.diffPackageMap[pkgOne.packageHash]).deep.eq(newDiff);
            });
        });
      });

      describe("getNewestApplicablePackage", () => {
        const deplKey: string = "3290fnf20jf02jfjwf0ij20fj209fj20j";
        let deplId: number = 0;
        let pkg1DTO: PackageDTO;
        let pkg2DTO: PackageDTO;
        let pkg3DTO: PackageDTO;
        let pkg4DTO: PackageDTO;
        let pkg5DTO: PackageDTO;

        before(() => {
          const appDTO = new AppDTO();
          const permission = "Owner";
          appDTO.name = "my new test app";
          appDTO.collaborators = {};
          appDTO.collaborators[email] = { permission };
          appDTO.deployments = {};
          appDTO.deployments[STAGING] = {
            key: deplKey,
            name: STAGING
          };
          return dao.createApp(appDTO).then(app => {
            return dao.deploymentForKey(deplKey).then(deployment => {
              deplId = deployment.id;
            });
          });
        });

        it("will return no package if there are no matching releases", () => {
          return dao
            .getNewestApplicablePackage(deplKey, undefined, undefined)
            .then(newest => {
              expect(newest).to.be.undefined;
            });
        });

        it("will return a release with no tags if that release is the most up-to-date release", () => {
          pkg1DTO = new PackageDTO();
          pkg1DTO.appVersion = "1.0.0";
          pkg1DTO.blobUrl = "http://stuff.com/package1/..";
          pkg1DTO.packageHash = "2930fj2j923892f9h9f831899182889hf";
          pkg1DTO.isDisabled = false;
          pkg1DTO.isMandatory = false;
          pkg1DTO.label = "v1";
          pkg1DTO.manifestBlobUrl = "http://stuff.com/manifest1/...";
          pkg1DTO.rollout = 100;
          pkg1DTO.size = 1500;
          pkg1DTO.releaseMethod = "Upload";
          pkg1DTO.releasedBy = email;

          return dao.addPackage(deplKey, pkg1DTO).then(updated => {
            pkg1DTO.id = updated.id;

            return dao
              .getNewestApplicablePackage(deplKey, undefined, undefined)
              .then(newest => {
                expect(newest).not.to.be.undefined;
                if (newest) {
                  expect(newest.id).to.eq(pkg1DTO.id);
                }
              });
          });
        });

        it("will return a release with no tags if none of the incoming tags match", () => {
          pkg2DTO = new PackageDTO();
          pkg2DTO.appVersion = "1.0.0";
          pkg2DTO.blobUrl = "http://stuff.com/package2/...";
          pkg2DTO.manifestBlobUrl = "http://stuff.com/manifest2/..";
          pkg2DTO.packageHash = "jnowfim20m3@@#%FMM@FK@K";
          pkg2DTO.isDisabled = false;
          pkg2DTO.isMandatory = false;
          pkg2DTO.label = "v2";
          pkg2DTO.rollout = 100;
          pkg2DTO.size = 1600;
          pkg2DTO.tags = ["TAG-1", "TAG-2"];
          pkg2DTO.releaseMethod = "Upload";
          pkg2DTO.releasedBy = email;

          return dao.addPackage(deplKey, pkg2DTO).then(updated => {
            pkg2DTO.id = updated.id;
            return dao
              .getNewestApplicablePackage(deplKey, undefined, undefined)
              .then(newest => {
                expect(newest).not.to.be.undefined;
                if (newest) {
                  expect(newest.id).to.eq(pkg1DTO.id);
                }
              })
              .then(() => {
                return dao
                  .getNewestApplicablePackage(deplKey, ["TAG-3"], undefined)
                  .then(newest => {
                    expect(newest).not.to.be.undefined;
                    if (newest) {
                      expect(newest.id).to.eq(pkg1DTO.id);
                    }
                  });
              });
          });
        });

        it("will return a release with tags if at least one incoming tag matches", () => {
          return dao
            .getNewestApplicablePackage(deplKey, ["TAG-1", "TAG-3"], undefined)
            .then(newest => {
              expect(newest).not.to.be.undefined;
              if (newest) {
                expect(newest.id).to.eq(pkg2DTO.id);
              }
            });
        });

        it("will return a release if there is an intermediate release that matches the incoming tags", () => {
          pkg3DTO = new PackageDTO();
          Object.assign(pkg3DTO, pkg1DTO);
          pkg3DTO.packageHash = "fion2ff@F#@NN@!@9100j1n1";
          pkg3DTO.blobUrl = "https://stuff.com/package3/...";
          pkg3DTO.manifestBlobUrl = "https://stuff.com/manifest3/...";
          pkg3DTO.size = 1700;
          pkg3DTO.label = "v3";
          pkg3DTO.tags = ["TAG-4", "TAG-5", "TAG-6"];

          return dao.addPackage(deplKey, pkg3DTO).then(updated => {
            pkg3DTO.id = updated.id;

            /*

                        At this point we have, in order of newest first:

                        pkg3 - ["TAG-4", "TAG-5", "TAG-6"]
                        pkg2 - ["TAG-1", "TAG-2"]
                        pkg1 - no tags

                        */

            return dao
              .getNewestApplicablePackage(deplKey, ["TAG-2"], undefined)
              .then(newest => {
                expect(newest).not.to.be.undefined;
                if (newest) {
                  expect(newest.id).to.eq(pkg2DTO.id);
                }
              });
          });
        });

        it("will return a release if there is an intermediate release with no tags", () => {
          pkg4DTO = new PackageDTO();
          Object.assign(pkg4DTO, pkg1DTO);
          pkg4DTO.packageHash = "wfn2i0f02390239gnbr2";
          pkg4DTO.blobUrl = "https://stuff.com/package4/...";
          pkg4DTO.manifestBlobUrl = "https://stuff.com/package4/...";
          pkg4DTO.size = 1800;
          pkg4DTO.label = "v4";
          // no tags

          return dao.addPackage(deplKey, pkg4DTO).then(updated => {
            pkg4DTO.id = updated.id;

            pkg5DTO = new PackageDTO();
            Object.assign(pkg5DTO, pkg1DTO);
            pkg4DTO.packageHash = "aio059gn2nf30920910189";
            pkg4DTO.blobUrl = "https://stuff.com/package5/...";
            pkg4DTO.manifestBlobUrl = "https://stuff.com/package5/...";
            pkg4DTO.size = 1900;
            pkg5DTO.label = "v5";
            pkg5DTO.tags = ["TAG-10", "TAG-11", "TAG-12", "TAG-13", "TAG-14"];

            return dao.addPackage(deplKey, pkg5DTO).then(updated5 => {
              pkg5DTO.id = updated5.id;

              /*

                            Now we have

                            pkg5 - ["TAG-10", "TAG-11", "TAG-12", "TAG-13", "TAG-14"]
                            pkg4 - no tags
                            pkg3 - ["TAG-4", "TAG-5", "TAG-6"]
                            pkg2 - ["TAG-1", "TAG-2"]
                            pkg1 - no tags

                            */

              return dao
                .getNewestApplicablePackage(deplKey, [], undefined)
                .then(newest => {
                  expect(newest).not.to.be.undefined;
                  if (newest) {
                    expect(newest.id).to.eq(pkg4DTO.id);
                  }
                });
            });
          });
        });
        it("will return release matching specified appVersion", () => {
          const versionToCheck = "1.1.0";
          let v1pkg = new PackageDTO();
          Object.assign(v1pkg, pkg1DTO, {
            appVersion: versionToCheck,
            packageHash: "2930fj2j923892f9h9f831899182889hf",
            label: "v1"
          });
          let v2pkg = new PackageDTO();
          Object.assign(v2pkg, v1pkg, {
            appVersion: "1.2.0",
            packageHash: "ABCDEFG",
            label: "v2"
          });
          return dao
            .addPackage(deplKey, v1pkg)
            .then(() => {
              return dao.addPackage(deplKey, v2pkg);
            })
            .then(() => {
              return dao
                .getNewestApplicablePackage(deplKey, [], versionToCheck)
                .then(release => {
                  expect(release).not.be.undefined;
                  if (release) {
                    expect(release.packageHash).to.eq(v1pkg.packageHash);
                  }
                });
            });
        });
        it("will return latest release matching specified appVersion", () => {
          const versionToCheck = "1.3.0";
          let v1apkg = new PackageDTO();
          Object.assign(v1apkg, pkg1DTO, {
            appVersion: versionToCheck,
            packageHash: "ABCDEF1234",
            label: "v1"
          });
          let v1bpkg = new PackageDTO();
          Object.assign(v1bpkg, v1apkg, {
            appVersion: versionToCheck,
            packageHash: "ABCDEF7890",
            label: "v2"
          });
          let v2pkg = new PackageDTO();
          Object.assign(v2pkg, v1apkg, {
            appVersion: "1.4.0",
            packageHash: "EDCBA44321",
            label: "v3"
          });
          return dao
            .addPackage(deplKey, v1apkg)
            .then(() => {
              return dao.addPackage(deplKey, v1bpkg);
            })
            .then(() => {
              return dao.addPackage(deplKey, v2pkg);
            })
            .then(() => {
              return dao
                .getNewestApplicablePackage(deplKey, [], versionToCheck)
                .then(release => {
                  expect(release).not.be.undefined;
                  if (release) {
                    expect(release.packageHash).to.eq(v1bpkg.packageHash);
                  }
                });
            });
        });
        it("will return undefined for unmatched appVersion", () => {
          const versionToCheck = "1.8.0";
          let v1pkg = new PackageDTO();
          Object.assign(v1pkg, pkg1DTO, {
            appVersion: "1.7.0",
            packageHash: "ACEBDF135246",
            label: "v1"
          });
          let v2pkg = new PackageDTO();
          Object.assign(v2pkg, pkg1DTO, {
            appVersion: "1.9.0",
            packageHash: "A1C3E5B2D4F6",
            label: "v2"
          });
          return dao
            .addPackage(deplKey, v1pkg)
            .then(() => {
              return dao.addPackage(deplKey, v2pkg);
            })
            .then(() => {
              return dao
                .getNewestApplicablePackage(deplKey, [], versionToCheck)
                .then(release => {
                  expect(release).is.undefined;
                });
            });
        });
        let matchPackage = (
          packageList: any[],
          searchCriteria: { tags: string[]; appVersion: string },
          matchLabel: string | null
        ) => {
          let allPkgs = packageList.map(pkg => {
            let dtoPkg = new PackageDTO();
            Object.assign(dtoPkg, pkg1DTO, pkg);
            return dao.addPackage(deplKey, dtoPkg);
          });
          return Promise.all(allPkgs)
            .then(() =>
              dao.getNewestApplicablePackage(
                deplKey,
                searchCriteria.tags,
                searchCriteria.appVersion
              )
            )
            .then(release => {
              if (matchLabel) {
                expect(release).not.to.be.undefined;
                if (release) {
                  expect(release.label).to.eq(matchLabel);
                }
              } else {
                expect(release).to.be.undefined;
              }
            });
        };
        it("will return release matching appVersion and tag", () => {
          const appVersion = "2.1.0";
          return matchPackage(
            [
              { appVersion, label: "v1", tags: ["PARROT", "EAGLE"] },
              { appVersion, label: "v2", tags: ["SNOOPY", "PITBULL"] },
              { appVersion, label: "v3", tags: ["EAGLE"] }
            ],
            { appVersion, tags: ["PITBULL"] },
            "v2"
          );
        });
        it("will return no release for matching tag but not appVersion", () => {
          return matchPackage(
            [{ appVersion: "2.9.0", label: "v23", tags: ["MATCHME"] }],
            { appVersion: "3.1.0", tags: ["MATCHME"] },
            null
          );
        });
        it("will return no release for matching appVersion but not tag", () => {
          const appVersion = "4.0.4";
          return matchPackage(
            [
              { appVersion, label: "v33", tags: ["BINGO"] },
              { appVersion, label: "v34", tags: ["GOFISH"] }
            ],
            { appVersion, tags: ["NOGAMES"] },
            null
          );
        });
        it("will return no release for matching appVersion against tagged release", () => {
          const appVersion = "5.0.5";
          return matchPackage(
            [{ tags: ["TOYOTA"], label: "v44", appVersion }],
            { tags: [], appVersion },
            null
          );
        });
      });
    });

    describe("history-related methods", () => {
      describe("history", () => {
        
        it("will throw an error if app not found", () => {
          return dao.history(-100, "stuff").catch(err => {
            expect(err).not.to.be.undefined;
            expect(err.toString()).to.contain("Not found");
          });
        });

        it("will throw an error if deployment not found", () => {
          return dao.history(appId, "strange deployment name").catch(err => {
            expect(err).not.to.be.undefined;
            expect(err.toString()).to.contain("Not found");
          });
        });

        it("will return the correct packages if deployment names are similar", () => {
          return dao.addDeployment(appId, INTLSTAGING, { key : intlStageDeploymentKey }).then((dep) => {
            const pkg6 = new PackageDTO();
            pkg6.appVersion = "7.7.7";
            pkg6.blobUrl = "http://stuff.com/pkg...";
            pkg6.description = "Plus Ultra!";
            pkg6.isDisabled = false;
            pkg6.isMandatory = false;
            pkg6.label = "v1";
            pkg6.manifestBlobUrl = "http://stuff.com/manifest...";
            pkg6.packageHash = packageHash;
            pkg6.releasedBy = "testUser";
            pkg6.releaseMethod = "Upload";
            pkg6.rollout = 100;
            pkg6.size = 12908201;
            pkg6.tags = ["TAG-10", "TAG-11", "TAG-12", "TAG-13", "TAG-14"];
            return dao.addPackage(intlStageDeploymentKey, pkg6).then(() => {
              return dao.history(appId, INTLSTAGING).then((packages) => {
                expect(packages).not.to.be.undefined;
                expect(packages.length).to.be.eq(1);
                expect(packages[0].description).to.equal("Plus Ultra!");
                expect(packages[0].appVersion).to.equal("7.7.7");
              });
            });
          });
        });

        it("returns a list of packages for an app and deployment", () => {
          return dao.history(appId, STAGING).then(packages => {
            expect(packages).not.to.be.undefined;
            expect(packages.length).to.be.gte(1);
            expect(packages[0].id).not.to.be.undefined;
            expect(packages[0].packageHash).not.to.be.undefined;
            expect(packages[0].diffPackageMap).not.to.be.undefined;
          });
        });

        it("returns an empty list for deployment with no history", () => {
          return dao.history(appId, PROD).then(packages => {
            expect(packages).not.to.be.undefined;
            expect(packages.length).to.eq(0);
          });
        });
      });

      describe("historyByIds", () => {
        it("gets a list of packages by id", () => {
          return dao.historyByIds([pkgId]).then(packages => {
            expect(packages).not.to.be.undefined;
            expect(packages.length).to.eq(1);
            expect(packages[0].id).to.eq(pkgId);
            expect(packages[0].packageHash).to.eq(packageHash);
          });
        });
      });

      describe("historyLabel", () => {
        it("will throw an error if a deployment has no package history", () => {
          return dao.historyLabel(appId, PROD, "").catch(err => {
            expect(err).not.to.be.undefined;
            expect(err.toString()).to.contain("Not found");
          });
        });

        it("will throw an error if there are no packages with the given label", () => {
          return dao.historyLabel(appId, STAGING, "").catch(err => {
            expect(err).not.to.be.undefined;
            expect(err.toString()).to.contain("Not found");
          });
        });

        it("gets a package for an app and deployment by label", () => {
          return dao.historyLabel(appId, STAGING, "v1").then(pkg => {
            expect(pkg).not.to.be.undefined;
            expect(pkg.label).to.eq("v1");
          });
        });
      });
    });

    describe("client ratio-related methods", () => {
      const clientUniqueId = "390f9jf29j109jf90829f2983f92n";
      const initRatio = 50;
      const initUpdated = false;
      const newRatio = 75;
      const newUpdated = true;

      describe("insertClientRatio", () => {
        it("will throw an error if the packageHash is not found", () => {
          // tslint:disable-next-line:max-line-length
          return dao
            .insertClientRatio(
              clientUniqueId,
              "SomeJunkHash",
              initRatio,
              initUpdated
            )
            .catch(err => {
              expect(err).not.to.be.undefined;
              expect(err.toString()).to.contain("Not found");
            });
        });

        it("will add a new client ratio record", () => {
          return dao
            .insertClientRatio(
              clientUniqueId,
              packageHash,
              initRatio,
              initUpdated
            )
            .then(() => {
              return dao.getConnection().then(connection => {
                return new Promise((resolve, reject) => {
                  connection.query(
                    `SELECT client_unique_id, package_id, create_time,
                                                ratio, is_updated
                                                FROM client_ratio
                                                WHERE client_unique_id = ?`,
                    [clientUniqueId],
                    (err, results) => {
                      if (err) {
                        reject(err);
                      } else {
                        expect(results).not.to.be.undefined;
                        expect(results.length).to.eq(1);
                        expect(results[0].client_unique_id).to.eq(
                          clientUniqueId
                        );
                        expect(results[0].ratio).to.eq(initRatio);
                        expect(results[0].is_updated === 1).to.eq(initUpdated);
                        resolve();
                      }
                    }
                  );
                });
              });
            });
        });

        it("will update an existing record", () => {
          return dao
            .insertClientRatio(
              clientUniqueId,
              packageHash,
              newRatio,
              newUpdated
            )
            .then(() => {
              return dao.getConnection().then(connection => {
                return new Promise((resolve, reject) => {
                  connection.query(
                    `SELECT client_unique_id, package_id, create_time,
                                                ratio, is_updated
                                                FROM client_ratio
                                                WHERE client_unique_id = ?`,
                    [clientUniqueId],
                    (err, results) => {
                      if (err) {
                        reject(err);
                      } else {
                        expect(results).not.to.be.undefined;
                        expect(results.length).to.eq(1);
                        expect(results[0].client_unique_id).to.eq(
                          clientUniqueId
                        );
                        expect(results[0].ratio).to.eq(newRatio);
                        expect(results[0].is_updated === 1).to.eq(newUpdated);
                        resolve();
                      }
                    }
                  );
                });
              });
            });
        });
      });

      describe("clientRatio", () => {
        it("will return undefined if package hash is not found", () => {
          return dao
            .clientRatio(clientUniqueId, "SomeJunkHash")
            .then(clientRatio => {
              expect(clientRatio).to.be.undefined;
            });
        });

        it("will return undefined with an unknown client id", () => {
          return dao
            .clientRatio("someOtherUniqueClientId", packageHash)
            .then(clientRatio => {
              expect(clientRatio).to.be.undefined;
            });
        });

        it("will return client ratio records for client id and package hash", () => {
          return dao
            .clientRatio(clientUniqueId, packageHash)
            .then(clientRatio => {
              expect(clientRatio).not.to.be.undefined;
              if (clientRatio) {
                expect(clientRatio.clientUniqueId).to.eq(clientUniqueId);
                expect(clientRatio.inserted).not.to.be.undefined;
                expect(clientRatio.packageHash).to.eq(packageHash);
                expect(clientRatio.updated).to.eq(newUpdated);
              }
            });
        });
      });
    });

    describe("metric-related methods", () => {
      const appVersion = "0.0.1";
      const clientUniqueId = "1290jf02f20j032j92f9n39238929212c2c2";
      const label = "v1";
      const status = "DeploymentSucceeded";
      const metricIn = new MetricInDTO();
      metricIn.deploymentKey = stageDeploymentKey;
      metricIn.appVersion = appVersion;
      metricIn.clientUniqueId = clientUniqueId;
      metricIn.label = label;
      metricIn.status = status;

      describe("insertMetric", () => {
        it("will throw an error if the deployment key is not found", () => {
          metricIn.deploymentKey = "SomeJunkKey";
          return dao.insertMetric(metricIn).catch(err => {
            expect(err).not.to.be.undefined;
            expect(err.toString()).to.contain("Not found");
          });
        });

        it("will add a metric record to the table", () => {
          metricIn.deploymentKey = stageDeploymentKey;
          return dao.insertMetric(metricIn).then(() => {
            return dao.getConnection().then(connection => {
              return new Promise((resolve, reject) => {
                connection.query(
                  "SELECT COUNT(*) AS count FROM metric WHERE deployment_id = " +
                    "(SELECT id FROM deployment WHERE deployment_key = ?)",
                  [stageDeploymentKey],
                  (err, results) => {
                    if (err) {
                      reject(err);
                    } else {
                      expect(results).not.to.be.undefined;
                      expect(results.length).to.eq(1);
                      expect(results[0].count).to.be.gte(1);
                      resolve();
                    }
                  }
                );
              });
            });
          });
        });
      });

      describe("metrics", () => {
        it("will throw an error if the deployment key is not found", () => {
          return dao.metrics("SomeJunkKey").catch(err => {
            expect(err).not.to.be.undefined;
            expect(err.toString()).to.contain("Not found");
          });
        });

        it("will fetch all the metrics for a deployment", () => {
          return dao.metrics(stageDeploymentKey).then(metrics => {
            expect(metrics).not.to.be.undefined;
            if (metrics) {
              expect(metrics.length).to.be.gte(1);
              const found = metrics.find(result => {
                return result.clientuniqueid === clientUniqueId;
              });

              expect(found).not.to.be.undefined;
              if (found) {
                expect(found.appversion).to.eq(appVersion);
                expect(found.label).to.eq(label);
                expect(found.status).to.eq(status);
              }
            }
          });
        });
      });

      describe("metrics summary", () => {
        const appVersion = "0.0.1";
        const clientUniqueId = "1290jf02f20j032j92f9n39238929212c2c2";
        const label = "v1";
        const status = "DeploymentSucceeded";

        before(() => {
          const metricData = [
            { label: "v1", appVersion: "1.0.0", status: "DeploymentSucceeded" },
            { label: "v1", appVersion: "1.0.0", status: "DeploymentSucceeded" },
            { label: "v1", appVersion: "1.0.0", status: "DeploymentFailed" },
            { label: "v1", appVersion: "1.1.0", status: "DeploymentFailed" },
            { label: "v2", appVersion: "1.0.0", status: "Downloaded" },
            { label: "v2", appVersion: "1.0.0", status: "Downloaded" },
            { label: "v2", appVersion: "1.2.0", status: "DeploymentSucceeded" },
            { label: "v3", appVersion: "1.2.0", status: "DeploymentFailed" },
            { label: "v3", appVersion: "1.1.0", status: "DeploymentSucceeded" },
            { label: "v2", appVersion: "1.0.0", status: "Downloaded" },
            { label: "v3", appVersion: "1.1.0", status: "DeploymentSucceeded" },
            { label: "v3", appVersion: "1.2.0", status: "DeploymentFailed" }
          ];
          let p = [];
          for (let i = 0; i < metricData.length; i++) {
            const metricIn = new MetricInDTO();
            metricIn.label = metricData[i].label;
            metricIn.appVersion = metricData[i].appVersion;
            metricIn.status = metricData[i].status;

            metricIn.deploymentKey = prodDeploymentKey;
            metricIn.clientUniqueId = clientUniqueId;
            p.push(dao.insertMetric(metricIn));
          }
          return Promise.all(p);
        });
        it("will throw an error if the deployment key is not found", () => {
          return dao.metricsByStatus("SomeJunkKey").catch(err => {
            expect(err).not.to.be.undefined;
            expect(err.toString()).to.contain("Not found");
          });
        });
        it("fetch summary of metrics for a deployment", () => {
          const assertCount = (
            list: MetricByStatusOutDTO[],
            label: string,
            version: string,
            status: string,
            total: number
          ) => {
            const found = list.find(item => {
              return (
                item.label.toString() === label &&
                item.appversion.toString() === version &&
                item.status.toString() === status
              );
            });
            expect(found).not.to.be.undefined;
            if (found) expect(found.total).to.eq(total);
          };
          return dao.metricsByStatus(prodDeploymentKey).then(metrics => {
            expect(metrics).not.to.be.undefined;
            expect(metrics.length).to.be.eq(7);
            assertCount(metrics, "v1", "1.0.0", "DeploymentSucceeded", 2);
            assertCount(metrics, "v1", "1.0.0", "DeploymentFailed", 1);
            assertCount(metrics, "v1", "1.1.0", "DeploymentFailed", 1);
            assertCount(metrics, "v2", "1.0.0", "Downloaded", 3);
            assertCount(metrics, "v2", "1.2.0", "DeploymentSucceeded", 1);
            assertCount(metrics, "v3", "1.1.0", "DeploymentSucceeded", 2);
            assertCount(metrics, "v3", "1.2.0", "DeploymentFailed", 2);
          });
        });
      });
    });

    describe("upload / download methods", () => {
      describe("upload", () => {
        it("saves the package content", () => {
          const buffer = readFileSync("./test/testContentFile.json");
          return dao.upload(packageHash, buffer).then(() => {
            expect(true).to.eq(true);
            return new Promise((resolve, reject) => {
              dao.getConnection().then(connection => {
                connection.query(
                  `SELECT COUNT(pc.package_hash) AS count
                                                FROM package_content pc
                                                WHERE pc.package_hash = ?`,
                  [packageHash],
                  (e, result) => {
                    expect(result).not.to.be.undefined;
                    expect(result.length).to.be.greaterThan(0);

                    expect(result[0].count).to.eq(1);
                    resolve();
                  }
                );
              });
            });
          });
        });
      });

      describe("download", () => {
        it("fetches the package content", () => {
          return dao.download(packageHash).then(content => {
            expect(content).not.to.be.undefined;
            const expected = readFileSync("./test/testContentFile.json");
            expect(content.toString()).to.eq(expected.toString());
          });
        });
      });
    });

    describe("destructive methods", () => {
      describe("clearHistory", () => {
        it("deletes all package history for the given app and deployment", () => {
          return dao.clearHistory(appId, STAGING).then(() => {
            return dao.history(appId, STAGING).then(packages => {
              expect(packages).not.to.be.undefined;
              expect(packages.length).to.eq(0);
            });
          });
        });
      });

      describe("removeApp", () => {
        before(() => {
          const pkg = new PackageDTO();
          pkg.appVersion = "0.0.1";
          pkg.blobUrl = "http://stuff.com/pkg...";
          pkg.description = "my new uploaded package";
          pkg.isDisabled = false;
          pkg.isMandatory = false;
          pkg.label = "v1";
          pkg.manifestBlobUrl = "http://stuff.com/manifest...";
          pkg.packageHash = packageHash;
          pkg.releasedBy = "testUser";
          pkg.releaseMethod = "Upload";
          pkg.rollout = 100;
          pkg.size = 12908201;

          return dao.addPackage(stageDeploymentKey, pkg);
        });

        it("removes an app and all its sub-tables from the db", () => {
          return dao.removeApp(appId).then(() => {
            return dao.getConnection().then(connection => {
              return new Promise((resolve, reject) => {
                // tslint:disable-next-line:max-line-length
                connection.query(
                  "SELECT COUNT(*) AS count FROM app WHERE id = ?",
                  [appId],
                  (err, result) => {
                    if (err) {
                      reject(err);
                    } else {
                      expect(result).not.to.be.undefined;
                      expect(result.length).to.eq(1);
                      expect(result[0].count).to.eq(0);
                      resolve();
                    }
                  }
                );
              });
            });
          });
        });
      });
    });
  });

  describe("error scenarios", () => {
    const myDAO = new MyDAO();

    before(() => {
      return myDAO.connect(testDBConfig).catch(err => {
        expect(err).not.to.be.undefined;
      });
    });

    it("will throw an error if there's a problem getting a connection", () => {
      return myDAO.getConnection().catch(err => {
        expect(err).not.to.be.undefined;
      });
    });

    it("will throw an error if there's a problem ending the pool", () => {
      return myDAO.close().catch(err => {
        expect(err).not.to.be.undefined;
      });
    });
  });

  describe("encrypted fields", () => {
    const createdTime = Date.now();
    const expires = createdTime + 60 * 24 * 3600 * 1000;
    const encryptedDao = new ElectrodeOtaDaoRdbms();
    const userDTO = new UserDTO();
    const keyName = "2903j09fj920j10jf";
    userDTO.email = "encrypt_me@walmart.com";
    userDTO.name = "Encrypt Me";
    userDTO.accessKeys = {};
    userDTO.accessKeys[keyName] = {
      createdBy: undefined,
      createdTime,
      description: "better encrypt me too",
      email: userDTO.email,
      expires,
      friendlyName: "A name that should be encrypted",
      id: "some junk",
      name: keyName
    };

    before(() => {
      return Encryptor.instance
        .initialize(testDBConfig.encryptionConfig)
        .then(() =>
          encryptedDao.connect(testDBConfig).then(() => {
            return encryptedDao.getConnection().then(conn => clearTables(conn));
          })
        );
    });

    after(() => {
      return encryptedDao.close();
    });

    it("User saved with encrypted email", () => {
      // Test encryption is enabled
      expect(Encryptor.instance.encrypt("user.email", userDTO.email)).to.not.eq(
        userDTO.email
      );
      expect(
        Encryptor.instance.encrypt(
          "access_key.friendly_name",
          userDTO.accessKeys[keyName].friendlyName
        )
      ).to.not.eq(userDTO.accessKeys[keyName].friendlyName);
      expect(
        Encryptor.instance.encrypt(
          "access_key.description",
          userDTO.accessKeys[keyName].description
        )
      ).to.not.eq(userDTO.accessKeys[keyName].description);

      // Test email and name stored encrypted
      return encryptedDao
        .createUser(userDTO)
        .then(createdUser => {
          expect(createdUser.email).to.eq(userDTO.email);
          expect(createdUser.name).to.eq(userDTO.name);
          expect(createdUser.accessKeys).not.to.be.undefined;
          expect(createdUser.accessKeys[keyName]).not.to.be.undefined;
          expect(createdUser.accessKeys[keyName].friendlyName).to.eq(
            userDTO.accessKeys[keyName].friendlyName
          );
          expect(createdUser.accessKeys[keyName].description).to.eq(
            userDTO.accessKeys[keyName].description
          );
          return createdUser;
        })
        .then(createdUser => {
          return encryptedDao.getConnection().then(conn => {
            return new Promise((resolve, reject) => {
              conn.query(
                `SELECT email, name FROM user WHERE email = ?`,
                [Encryptor.instance.encrypt("user.email", createdUser.email)],
                (err, results) => {
                  if (err) {
                    reject(err);
                  } else {
                    expect(results.length).to.eq(1);
                    expect(
                      Encryptor.instance.decrypt("user.email", results[0].name)
                    ).to.eq(userDTO.name);

                    conn.query(
                      "SELECT name, friendly_name, description FROM access_key WHERE user_id = ?",
                      [createdUser.id],
                      (err, accessKeyResults) => {
                        if (err) {
                          reject(err);
                        } else {
                          expect(accessKeyResults.length).to.eq(1);
                          expect(accessKeyResults[0].name).to.eq(keyName);
                          expect(
                            Encryptor.instance.decrypt(
                              "access_key.friendly_name",
                              accessKeyResults[0].friendly_name
                            )
                          ).to.eq(userDTO.accessKeys[keyName].friendlyName);
                          expect(
                            Encryptor.instance.decrypt(
                              "access_key.description",
                              accessKeyResults[0].description
                            )
                          ).to.eq(userDTO.accessKeys[keyName].description);
                          resolve();
                        }
                      }
                    );
                  }
                }
              );
            });
          });
        });
    });

    it("Save package with encrypted email", () => {
      const pkg = new PackageDTO();
      pkg.appVersion = "0.0.1";
      pkg.blobUrl = "http://example.com/encrypt";
      pkg.description = "Encrypt package description";
      pkg.isDisabled = pkg.isMandatory = false;
      pkg.label = "v1";
      pkg.manifestBlobUrl = "http://example.com/manifest";
      pkg.packageHash = "hash";
      pkg.releasedBy = "secret_user@walmart.com";
      pkg.releaseMethod = "download";
      pkg.rollout = 100;
      pkg.size = 1001;

      expect(
        Encryptor.instance.encrypt("package.released_by", pkg.releasedBy)
      ).to.not.eq(pkg.releasedBy);

      return encryptedDao
        .addDeployment(appId, STAGING, { key: stageDeploymentKey })
        .then(() => encryptedDao.addPackage(stageDeploymentKey, pkg))
        .then(updated => {
          expect(updated.releasedBy).to.eql(pkg.releasedBy);
          return encryptedDao.getConnection().then(conn => {
            return new Promise((resolve, reject) => {
              conn.query(
                `SELECT released_by FROM package where id=?`,
                [updated.id],
                (err, results) => {
                  if (err) {
                    reject(err);
                  } else {
                    expect(results.length).to.eq(1);
                    expect(
                      Encryptor.instance.decrypt(
                        "package.released_by",
                        results[0].released_by
                      )
                    ).to.eq(updated.releasedBy);
                    resolve();
                  }
                }
              );
            });
          });
        });
    });

    describe("encryptDTO", () => {
      it("can encrypt certain fields in a UserDTO", () => {
        const email = "encrypt_me@walmart.com";
        const name = "Encrypt Me";
        const userDTO = new UserDTO();
        userDTO.email = email;
        userDTO.name = name;

        Encryptor.instance.encryptDTO(userDTO);

        expect(userDTO.email).not.to.eq(email);
        expect(userDTO.name).not.to.eq(name);
      });

      it("can encrypt certain fields in a PackageDTO", () => {
        const releasedBy = "secret_user@walmart.com";
        const appVersion = "0.0.1";
        const blobUrl = "http://example.com/encrypt";
        const description = "Encrypt package description";
        const label = "v1";
        const manifestBlobUrl = "http://example.com/manifest";
        const packageHash = "hash";
        const releaseMethod = "upload";
        const rollout = 100;
        const size = 1001;

        const pkg = new PackageDTO();
        pkg.appVersion = appVersion;
        pkg.blobUrl = blobUrl;
        pkg.description = description;
        pkg.isDisabled = pkg.isMandatory = false;
        pkg.label = label;
        pkg.manifestBlobUrl = manifestBlobUrl;
        pkg.packageHash = packageHash;
        pkg.releasedBy = releasedBy;
        pkg.releaseMethod = releaseMethod;
        pkg.rollout = rollout;
        pkg.size = size;

        Encryptor.instance.encryptDTO(pkg);
        expect(pkg.releasedBy).not.to.eq(releasedBy);

        expect(pkg.appVersion).to.eq(appVersion);
        expect(pkg.blobUrl).to.eq(blobUrl);
        expect(pkg.description).to.eq(description);
        expect(pkg.label).to.eq(label);
        expect(pkg.manifestBlobUrl).to.eq(manifestBlobUrl);
        expect(pkg.releaseMethod).to.eq(releaseMethod);
        expect(pkg.rollout).to.eq(rollout);
        expect(pkg.size).to.eq(size);
      });

      it("will only encrypt certain DTOs", () => {
        const appDTO = new AppDTO();
        const appName = "My Cool App";
        appDTO.name = appName;

        Encryptor.instance.encryptDTO(appDTO);
        expect(appDTO.name).to.eq(appName);
        Encryptor.instance.decryptDTO(appDTO);
        expect(appDTO.name).to.eq(appName);
      });
    });

    describe("Encryptor init", () => {
      it("will fail if the key file is specified but does not exist", () => {
        const badConfig = {
          keyfile: "./test/missing.key"
        };

        const local = new Encryptor();
        local
          .initialize(badConfig)
          .then(() => {
            // should not come here
            expect(true).to.eq(false);
          })
          .catch(err => {
            expect(err).not.to.be.undefined;
          });
      });

      it("will not do anything if there is no key file", () => {
        const local = new Encryptor();
        const noKeyConfig = {
          fields: [
            "user.name",
            "user.email",
            "package.released_by",
            "access_key.friendly_name",
            "access_key.description"
          ]
        };
        local.initialize(noKeyConfig).then(() => {
          const email = "encrypt_me@walmart.com";
          const name = "Encrypt Me";
          const userDTO = new UserDTO();
          userDTO.email = email;
          userDTO.name = name;

          local.encryptDTO(userDTO);

          expect(userDTO.email).to.eq(email);
          expect(userDTO.name).to.eq(name);
        });
      });
    });
  });
});
