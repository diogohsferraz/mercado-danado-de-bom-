plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
}

android {
    namespace = "br.com.danadodebom.totem"
    compileSdk = 34

    defaultConfig {
        applicationId = "br.com.danadodebom.totem"
        // Moderninha Smart / Smart 2 rodam Android 7.1 a 9 (API 25 a 28), segundo a PagBank.
        minSdk = 25
        targetSdk = 28
        versionCode = 1
        versionName = "1.0.0"
        // Endereço padrão do app web (pode ser trocado na tela de configuração do app).
        buildConfigField("String", "URL_PADRAO", "\"https://diogohsferraz.github.io/mercado-danado-de-bom-/\"")
    }

    buildTypes {
        release {
            isMinifyEnabled = false
        }
    }
    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
    kotlinOptions {
        jvmTarget = "17"
    }
    buildFeatures {
        buildConfig = true
    }
    lint {
        // targetSdk 28 é exigência da maquininha, não um descuido.
        disable += setOf("ExpiredTargetSdkVersion", "OldTargetApi")
        abortOnError = false
        checkReleaseBuilds = false
    }
}

dependencies {
    implementation("br.com.uol.pagseguro.plugpagservice.wrapper:wrapper:1.35.0")
}
