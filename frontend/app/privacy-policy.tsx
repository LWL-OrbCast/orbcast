import React, { useCallback } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { colors } from '../src/theme/colors';

export default function PrivacyPolicyScreen() {
  const { t } = useTranslation();
  const router = useRouter();

  const handleBack = useCallback(() => {
    router.back();
  }, [router]);

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={handleBack} style={styles.backButton}>
          <Ionicons name="arrow-back" size={22} color={colors.text.primary} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>{t('privacyPolicyPage.headerTitle')}</Text>
        <View style={styles.headerSpacer} />
      </View>
      <ScrollView
        style={styles.content}
        contentContainerStyle={styles.contentContainer}
        showsVerticalScrollIndicator={false}
      >
        <Text style={styles.title}>{t('privacyPolicyPage.title')}</Text>
        <Text style={styles.subtitle}>{t('privacyPolicyPage.subtitle')}</Text>

        <Text style={styles.heading}>{t('privacyPolicyPage.sections.introduction.heading')}</Text>
        <Text style={styles.body}>
          {t('privacyPolicyPage.sections.introduction.body')}
        </Text>

        <Text style={styles.heading}>{t('privacyPolicyPage.sections.informationWeCollect.heading')}</Text>
        <Text style={styles.body}>{t('privacyPolicyPage.sections.informationWeCollect.walletData')}</Text>
        <Text style={styles.body}>{t('privacyPolicyPage.sections.informationWeCollect.authenticationData')}</Text>
        <Text style={styles.body}>{t('privacyPolicyPage.sections.informationWeCollect.deviceData')}</Text>
        <Text style={styles.body}>{t('privacyPolicyPage.sections.informationWeCollect.usageData')}</Text>

        <Text style={styles.heading}>{t('privacyPolicyPage.sections.howWeUseInformation.heading')}</Text>
        <Text style={styles.body}>{t('privacyPolicyPage.sections.howWeUseInformation.provideMaintainImprove')}</Text>
        <Text style={styles.body}>{t('privacyPolicyPage.sections.howWeUseInformation.geofencingCompliance')}</Text>
        <Text style={styles.body}>{t('privacyPolicyPage.sections.howWeUseInformation.legalSecurity')}</Text>
        <Text style={styles.body}>{t('privacyPolicyPage.sections.howWeUseInformation.communication')}</Text>

        <Text style={styles.heading}>{t('privacyPolicyPage.sections.howWeShareInformation.heading')}</Text>
        <Text style={styles.body}>{t('privacyPolicyPage.sections.howWeShareInformation.serviceProviders')}</Text>
        <Text style={styles.body}>{t('privacyPolicyPage.sections.howWeShareInformation.authenticationPartners')}</Text>
        <Text style={styles.body}>{t('privacyPolicyPage.sections.howWeShareInformation.paymentProcessors')}</Text>
        <Text style={styles.body}>{t('privacyPolicyPage.sections.howWeShareInformation.lawEnforcement')}</Text>

        <Text style={styles.heading}>{t('privacyPolicyPage.sections.dataRetentionDeletion.heading')}</Text>
        <Text style={styles.body}>{t('privacyPolicyPage.sections.dataRetentionDeletion.accountDeletion')}</Text>
        <Text style={styles.body}>{t('privacyPolicyPage.sections.dataRetentionDeletion.blockchainException')}</Text>

        <Text style={styles.heading}>{t('privacyPolicyPage.sections.userControlWalletOwnership.heading')}</Text>
        <Text style={styles.body}>{t('privacyPolicyPage.sections.userControlWalletOwnership.noAccess')}</Text>

        <Text style={styles.heading}>{t('privacyPolicyPage.sections.dataSecurity.heading')}</Text>
        <Text style={styles.body}>{t('privacyPolicyPage.sections.dataSecurity.intro')}</Text>
        <Text style={styles.body}>{t('privacyPolicyPage.sections.dataSecurity.secureWallet')}</Text>
        <Text style={styles.body}>{t('privacyPolicyPage.sections.dataSecurity.noRecovery')}</Text>

        <Text style={styles.heading}>{t('privacyPolicyPage.sections.updatesToPolicy.heading')}</Text>
        <Text style={styles.body}>{t('privacyPolicyPage.sections.updatesToPolicy.body')}</Text>

        <Text style={styles.heading}>{t('privacyPolicyPage.sections.contactUs.heading')}</Text>
        <Text style={styles.body}>{t('privacyPolicyPage.sections.contactUs.body')}</Text>
        <Text style={styles.body}>{t('privacyPolicyPage.sections.contactUs.companyName')}</Text>
        <Text style={styles.body}>{t('privacyPolicyPage.sections.contactUs.address')}</Text>
        <Text style={styles.body}>{t('privacyPolicyPage.sections.contactUs.email')}</Text>
        <Text style={styles.body}>{t('privacyPolicyPage.sections.contactUs.phone')}</Text>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background.primary },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: colors.border.primary },
  headerTitle: { fontSize: 16, fontWeight: '800', color: colors.text.primary },
  backButton: { padding: 6 },
  headerSpacer: { width: 28 },
  content: { flex: 1 },
  contentContainer: { padding: 16, paddingBottom: 56 },
  title: { fontSize: 20, fontWeight: '900', color: colors.text.primary, marginBottom: 6 },
  subtitle: { fontSize: 12, color: colors.text.tertiary, marginBottom: 16 },
  heading: { fontSize: 14, fontWeight: '800', color: colors.text.primary, marginTop: 14, marginBottom: 6 },
  body: { fontSize: 13, color: colors.text.secondary, lineHeight: 20, marginBottom: 6 },
});
