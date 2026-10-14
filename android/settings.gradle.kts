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
        // Biblioteca PlugPagServiceWrapper (PagBank) para a Moderninha Smart
        maven { url = uri("https://github.com/pagseguro/PlugPagServiceWrapper/raw/master") }
    }
}
rootProject.name = "TotemDanadoDeBom"
include(":app")
