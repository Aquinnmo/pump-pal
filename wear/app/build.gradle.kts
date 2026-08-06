import java.util.Properties

plugins {
  id("com.android.application")
  id("org.jetbrains.kotlin.android")
  id("org.jetbrains.kotlin.plugin.compose")
}

// The Data Layer only connects two apps that share a package name AND a signing key,
// so this must be signed with the same keystore EAS uses for the phone build.
// Copy keystore.properties.example to keystore.properties and fill it in (untracked).
val keystoreProperties = Properties().apply {
  val file = rootProject.file("keystore.properties")
  if (file.exists()) file.inputStream().use { load(it) }
}

android {
  namespace = "com.aquinnmo.timber.wear"
  compileSdk = 35

  defaultConfig {
    minSdk = 30
    targetSdk = 34
    versionCode = 1
    versionName = "1.0"
  }

  signingConfigs {
    create("release") {
      keystoreProperties.getProperty("storeFile")?.let {
        storeFile = rootProject.file(it)
        storePassword = keystoreProperties.getProperty("storePassword")
        keyAlias = keystoreProperties.getProperty("keyAlias")
        keyPassword = keystoreProperties.getProperty("keyPassword")
      }
    }
  }

  // One flavor per phone build, because app.config.js renames the dev variant and a
  // watch app can only pair with the exact package name it declares.
  flavorDimensions += "variant"
  productFlavors {
    create("prod") {
      dimension = "variant"
      applicationId = "com.aquinnmo.timber"
    }
    create("dev") {
      dimension = "variant"
      applicationId = "com.aquinnmo.timber_dev"
    }
  }

  buildTypes {
    release {
      isMinifyEnabled = false
      signingConfig = signingConfigs.getByName("release")
    }
  }

  buildFeatures {
    compose = true
  }

  compileOptions {
    sourceCompatibility = JavaVersion.VERSION_17
    targetCompatibility = JavaVersion.VERSION_17
  }

  kotlinOptions {
    jvmTarget = "17"
  }
}

dependencies {
  implementation("com.google.android.gms:play-services-wearable:18.2.0")
  // Task<T>.await() — lets the Data Layer calls read as straight-line code.
  implementation("org.jetbrains.kotlinx:kotlinx-coroutines-play-services:1.8.1")
  implementation(platform("androidx.compose:compose-bom:2024.09.03"))
  implementation("androidx.compose.ui:ui")
  implementation("androidx.wear.compose:compose-material:1.4.0")
  implementation("androidx.wear.compose:compose-foundation:1.4.0")
  implementation("androidx.activity:activity-compose:1.9.3")
  implementation("androidx.lifecycle:lifecycle-runtime-ktx:2.8.7")
  implementation("androidx.core:core-ktx:1.13.1")
}
