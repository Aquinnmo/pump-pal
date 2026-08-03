pluginManagement {
  repositories {
    google()
    mavenCentral()
    gradlePluginPortal()
  }
}

dependencyResolutionManagement {
  repositoriesMode.set(RepositoriesMode.FAIL_ON_PROJECT_REPOS)
  repositories {
    google()
    mavenCentral()
  }
}

// Standalone of the phone app on purpose: it is built and installed from Android
// Studio, not by EAS, so it never touches the Expo prebuild output.
rootProject.name = "TimberWear"
include(":app")
