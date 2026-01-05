param location string = resourceGroup().location
param namePrefix string
param environment string {
  allowed: [
    'enterprise'
    'public'
  ]
}
param appServicePlanSku object = {
  name: 'P1v3'
  capacity: 1
}
param authConfig object = {
  clientId: ''
  issuer: ''
  audience: ''
}
param tenantIds array = []

var normalizedPrefix = toLower(replace(namePrefix, '_', '-'))
var appServicePlanName = '${normalizedPrefix}-asp'
var appInsightsName = '${normalizedPrefix}-appi'
var keyVaultName = '${normalizedPrefix}-kv'
var storageAccountName = toLower('${uniqueString(resourceGroup().id, normalizedPrefix)}sa')
var serviceBusName = '${normalizedPrefix}-sb'
var cosmosAccountName = '${normalizedPrefix}-cosmos'
var docIntelligenceName = '${normalizedPrefix}-docint'
var managedIdentityName = '${normalizedPrefix}-uami'

resource appServicePlan 'Microsoft.Web/serverfarms@2022-09-01' = {
  name: appServicePlanName
  location: location
  sku: {
    name: appServicePlanSku.name
    capacity: appServicePlanSku.capacity
  }
  kind: 'app'
  properties: {
    reserved: false
  }
}

resource appInsights 'Microsoft.Insights/components@2020-02-02' = {
  name: appInsightsName
  location: location
  kind: 'web'
  properties: {
    Application_Type: 'web'
  }
}

resource userAssignedIdentity 'Microsoft.ManagedIdentity/userAssignedIdentities@2023-01-31' = {
  name: managedIdentityName
  location: location
}

resource storageAccount 'Microsoft.Storage/storageAccounts@2023-01-01' = {
  name: storageAccountName
  location: location
  sku: {
    name: 'Standard_LRS'
  }
  kind: 'StorageV2'
  properties: {
    minimumTlsVersion: 'TLS1_2'
    allowBlobPublicAccess: false
  }
}

resource serviceBusNamespace 'Microsoft.ServiceBus/namespaces@2022-10-01-preview' = {
  name: serviceBusName
  location: location
  sku: {
    name: 'Standard'
    tier: 'Standard'
  }
  properties: {
    publicNetworkAccess: 'Enabled'
  }
}

resource cosmosAccount 'Microsoft.DocumentDB/databaseAccounts@2023-04-15' = {
  name: cosmosAccountName
  location: location
  kind: 'GlobalDocumentDB'
  properties: {
    databaseAccountOfferType: 'Standard'
    locations: [
      {
        locationName: location
        failoverPriority: 0
      }
    ]
    consistencyPolicy: {
      defaultConsistencyLevel: 'Session'
    }
    capabilities: [
      {
        name: 'EnableServerless'
      }
    ]
  }
}

resource documentIntelligence 'Microsoft.CognitiveServices/accounts@2023-05-01' = {
  name: docIntelligenceName
  location: location
  kind: 'FormRecognizer'
  sku: {
    name: 'S0'
  }
  properties: {
    customSubDomainName: docIntelligenceName
  }
}

resource aiFoundryPerTenant 'Microsoft.CognitiveServices/accounts@2023-05-01' = [for tenantId in tenantIds: {
  name: toLower('${normalizedPrefix}-aif-${uniqueString(tenantId, resourceGroup().id)}')
  location: location
  kind: 'AIServices'
  sku: {
    name: 'S0'
  }
  properties: {
    customSubDomainName: toLower('${normalizedPrefix}-aif-${uniqueString(tenantId, resourceGroup().id)}')
  }
}]

resource keyVault 'Microsoft.KeyVault/vaults@2023-02-01' = {
  name: keyVaultName
  location: location
  properties: {
    sku: {
      family: 'A'
      name: 'standard'
    }
    tenantId: subscription().tenantId
    enableRbacAuthorization: true
    publicNetworkAccess: 'Enabled'
  }
}

resource webApp 'Microsoft.Web/sites@2022-09-01' = {
  name: '${normalizedPrefix}-web'
  location: location
  identity: {
    type: 'SystemAssigned, UserAssigned'
    userAssignedIdentities: {
      '${userAssignedIdentity.id}': {}
    }
  }
  properties: {
    serverFarmId: appServicePlan.id
    siteConfig: {
      appSettings: [
        {
          name: 'APPINSIGHTS_CONNECTIONSTRING'
          value: appInsights.properties.ConnectionString
        }
        {
          name: 'ENVIRONMENT'
          value: environment
        }
        {
          name: 'ROLE'
          value: 'web'
        }
      ]
    }
  }
}

resource apiApp 'Microsoft.Web/sites@2022-09-01' = {
  name: '${normalizedPrefix}-api'
  location: location
  identity: {
    type: 'SystemAssigned, UserAssigned'
    userAssignedIdentities: {
      '${userAssignedIdentity.id}': {}
    }
  }
  properties: {
    serverFarmId: appServicePlan.id
    siteConfig: {
      appSettings: [
        {
          name: 'APPINSIGHTS_CONNECTIONSTRING'
          value: appInsights.properties.ConnectionString
        }
        {
          name: 'ENVIRONMENT'
          value: environment
        }
        {
          name: 'ROLE'
          value: 'api'
        }
      ]
    }
  }
}

resource workerApp 'Microsoft.Web/sites@2022-09-01' = {
  name: '${normalizedPrefix}-worker'
  location: location
  identity: {
    type: 'SystemAssigned, UserAssigned'
    userAssignedIdentities: {
      '${userAssignedIdentity.id}': {}
    }
  }
  properties: {
    serverFarmId: appServicePlan.id
    siteConfig: {
      appSettings: [
        {
          name: 'APPINSIGHTS_CONNECTIONSTRING'
          value: appInsights.properties.ConnectionString
        }
        {
          name: 'ENVIRONMENT'
          value: environment
        }
        {
          name: 'ROLE'
          value: 'worker'
        }
      ]
    }
  }
}

resource webAuth 'Microsoft.Web/sites/config@2022-09-01' = {
  name: '${webApp.name}/authsettingsV2'
  properties: {
    platform: {
      enabled: true
    }
    globalValidation: {
      requireAuthentication: true
      unauthenticatedClientAction: 'RedirectToLoginPage'
    }
    identityProviders: {
      azureActiveDirectory: {
        enabled: true
        registration: {
          clientId: authConfig.clientId
          openIdIssuer: authConfig.issuer
        }
        validation: {
          allowedAudiences: [
            authConfig.audience
          ]
        }
      }
    }
    login: {
      tokenStore: {
        enabled: true
      }
    }
  }
}

resource apiAuth 'Microsoft.Web/sites/config@2022-09-01' = {
  name: '${apiApp.name}/authsettingsV2'
  properties: {
    platform: {
      enabled: true
    }
    globalValidation: {
      requireAuthentication: true
      unauthenticatedClientAction: 'Return401'
    }
    identityProviders: {
      azureActiveDirectory: {
        enabled: true
        registration: {
          clientId: authConfig.clientId
          openIdIssuer: authConfig.issuer
        }
        validation: {
          allowedAudiences: [
            authConfig.audience
          ]
        }
      }
    }
  }
}

resource workerAuth 'Microsoft.Web/sites/config@2022-09-01' = {
  name: '${workerApp.name}/authsettingsV2'
  properties: {
    platform: {
      enabled: true
    }
    globalValidation: {
      requireAuthentication: true
      unauthenticatedClientAction: 'Return401'
    }
    identityProviders: {
      azureActiveDirectory: {
        enabled: true
        registration: {
          clientId: authConfig.clientId
          openIdIssuer: authConfig.issuer
        }
        validation: {
          allowedAudiences: [
            authConfig.audience
          ]
        }
      }
    }
  }
}

output managedIdentityClientId string = userAssignedIdentity.properties.clientId
output appInsightsConnectionString string = appInsights.properties.ConnectionString
output storageAccountName string = storageAccount.name
output serviceBusNamespace string = serviceBusNamespace.name
output cosmosAccountName string = cosmosAccount.name
output keyVaultName string = keyVault.name
