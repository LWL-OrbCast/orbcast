import React, { useCallback } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Linking } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { colors } from '../src/theme/colors';

export default function TermsScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const PRIVY_EXPORT_URL = 'https://home.privy.io';

  const handleBack = useCallback(() => {
    router.back();
  }, [router]);

  const handleOpenPrivyExportUrl = useCallback(() => {
    Linking.openURL(PRIVY_EXPORT_URL).catch(() => {
      // no-op: keep UX non-blocking if opening the browser fails
    });
  }, [PRIVY_EXPORT_URL]);

  const renderKeyRecoveryText = useCallback(() => {
    const text = String(t('termsPage.sections.nonCustodialNature.keyRecovery'));
    const [before, ...afterParts] = text.split(PRIVY_EXPORT_URL);
    if (!afterParts.length) return text;
    const after = afterParts.join(PRIVY_EXPORT_URL);

    return (
      <>
        {before}
        <Text style={styles.link} onPress={handleOpenPrivyExportUrl}>
          {PRIVY_EXPORT_URL}
        </Text>
        {after}
      </>
    );
  }, [PRIVY_EXPORT_URL, handleOpenPrivyExportUrl, t]);

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={handleBack} style={styles.backButton}>
          <Ionicons name="arrow-back" size={22} color={colors.text.primary} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>{t('termsPage.headerTitle')}</Text>
        <View style={styles.headerSpacer} />
      </View>
      <ScrollView
        style={styles.content}
        contentContainerStyle={styles.contentContainer}
        showsVerticalScrollIndicator={false}
      >
        <Text style={styles.title}>{t('termsPage.title')}</Text>
        <Text style={styles.subtitle}>{t('termsPage.subtitle')}</Text>

        <Text style={styles.heading}>{t('termsPage.sections.acceptanceOfTerms.heading')}</Text>
        <Text style={styles.body}>{t('termsPage.sections.acceptanceOfTerms.body')}</Text>
        <Text style={styles.body}>{t('termsPage.sections.acceptanceOfTerms.operatorDisclosure')}</Text>

        <Text style={styles.heading}>{t('termsPage.sections.restrictedJurisdictions.heading')}</Text>
        <Text style={styles.body}>{t('termsPage.sections.restrictedJurisdictions.body')}</Text>
        <Text style={styles.body}>{t('termsPage.sections.restrictedJurisdictions.prohibitedJurisdictions')}</Text>
        <Text style={styles.body}>{t('termsPage.sections.restrictedJurisdictions.representation')}</Text>
        <Text style={styles.body}>{t('termsPage.sections.restrictedJurisdictions.enforcement')}</Text>

        <Text style={styles.heading}>{t('termsPage.sections.descriptionOfService.heading')}</Text>
        <Text style={styles.body}>{t('termsPage.sections.descriptionOfService.body')}</Text>
        <Text style={styles.body}>{t('termsPage.sections.descriptionOfService.outcomeMarkets')}</Text>
        <Text style={styles.body}>{t('termsPage.sections.descriptionOfService.finalBody')}</Text>

        <Text style={styles.heading}>{t('termsPage.sections.nonCustodialNature.heading')}</Text>
        <Text style={styles.body}>{t('termsPage.sections.nonCustodialNature.noCustody')}</Text>
        <Text style={styles.body}>{t('termsPage.sections.nonCustodialNature.walletManagement')}</Text>
        <Text style={styles.body}>{renderKeyRecoveryText()}</Text>
        <Text style={styles.body}>{t('termsPage.sections.nonCustodialNature.acknowledgmentOfRisk')}</Text>

        <Text style={styles.heading}>{t('termsPage.sections.twoBalanceSystem.heading')}</Text>
        <Text style={styles.body}>{t('termsPage.sections.twoBalanceSystem.body')}</Text>
        <Text style={styles.body}>{t('termsPage.sections.twoBalanceSystem.walletBalance')}</Text>
        <Text style={styles.body}>{t('termsPage.sections.twoBalanceSystem.tradeBalance')}</Text>
        <Text style={styles.body}>{t('termsPage.sections.twoBalanceSystem.finalBody')}</Text>

        <Text style={styles.heading}>{t('termsPage.sections.eligibilityAccountSecurity.heading')}</Text>
        <Text style={styles.body}>{t('termsPage.sections.eligibilityAccountSecurity.body')}</Text>

        <Text style={styles.heading}>{t('termsPage.sections.feeStructure.heading')}</Text>
        <Text style={styles.body}>{t('termsPage.sections.feeStructure.body')}</Text>
        <Text style={styles.body}>{t('termsPage.sections.feeStructure.disclosure')}</Text>
        <Text style={styles.body}>{t('termsPage.sections.feeStructure.finalBody')}</Text>

        <Text style={styles.heading}>{t('termsPage.sections.tradingRisks.heading')}</Text>
        <Text style={styles.body}>{t('termsPage.sections.tradingRisks.highRiskActivity')}</Text>
        <Text style={styles.body}>{t('termsPage.sections.tradingRisks.settlementRisk')}</Text>
        <Text style={styles.body}>{t('termsPage.sections.tradingRisks.noLeverage')}</Text>
        <Text style={styles.body}>{t('termsPage.sections.tradingRisks.noAdvice')}</Text>

        <Text style={styles.heading}>{t('termsPage.sections.marketSpecificFeatures.heading')}</Text>
        <Text style={styles.body}>{t('termsPage.sections.marketSpecificFeatures.body')}</Text>
        <Text style={styles.body}>{t('termsPage.sections.marketSpecificFeatures.trading247')}</Text>
        <Text style={styles.body}>{t('termsPage.sections.marketSpecificFeatures.settlement')}</Text>
        <Text style={styles.body}>{t('termsPage.sections.marketSpecificFeatures.books')}</Text>
        <Text style={styles.body}>{t('termsPage.sections.marketSpecificFeatures.finalBody')}</Text>

        <Text style={styles.heading}>{t('termsPage.sections.thirdPartyServices.heading')}</Text>
        <Text style={styles.body}>{t('termsPage.sections.thirdPartyServices.body')}</Text>
        <Text style={styles.body}>{t('termsPage.sections.thirdPartyServices.privy')}</Text>
        <Text style={styles.body}>{t('termsPage.sections.thirdPartyServices.moonpay')}</Text>
        <Text style={styles.body}>{t('termsPage.sections.thirdPartyServices.arbitrum')}</Text>
        <Text style={styles.body}>{t('termsPage.sections.thirdPartyServices.hyperliquidProtocol')}</Text>
        <Text style={styles.body}>{t('termsPage.sections.thirdPartyServices.finalBody')}</Text>

        <Text style={styles.heading}>{t('termsPage.sections.depositsWithdrawalsTransfers.heading')}</Text>
        <Text style={styles.body}>{t('termsPage.sections.depositsWithdrawalsTransfers.supportedAsset')}</Text>
        <Text style={styles.body}>{t('termsPage.sections.depositsWithdrawalsTransfers.depositMethods')}</Text>
        <Text style={styles.body}>{t('termsPage.sections.depositsWithdrawalsTransfers.withdrawal')}</Text>
        <Text style={styles.body}>{t('termsPage.sections.depositsWithdrawalsTransfers.irreversibility')}</Text>
        <Text style={styles.body}>{t('termsPage.sections.depositsWithdrawalsTransfers.noReversals')}</Text>

        <Text style={styles.heading}>{t('termsPage.sections.oneTapTradingAuthorizations.heading')}</Text>
        <Text style={styles.body}>{t('termsPage.sections.oneTapTradingAuthorizations.body')}</Text>

        <Text style={styles.heading}>{t('termsPage.sections.protocolDependencyTechnicalRisks.heading')}</Text>
        <Text style={styles.body}>{t('termsPage.sections.protocolDependencyTechnicalRisks.body')}</Text>
        <Text style={styles.body}>{t('termsPage.sections.protocolDependencyTechnicalRisks.smartContractRisk')}</Text>
        <Text style={styles.body}>{t('termsPage.sections.protocolDependencyTechnicalRisks.networkCongestion')}</Text>
        <Text style={styles.body}>{t('termsPage.sections.protocolDependencyTechnicalRisks.oracleFailure')}</Text>
        <Text style={styles.body}>{t('termsPage.sections.protocolDependencyTechnicalRisks.bridgeRisk')}</Text>
        <Text style={styles.body}>{t('termsPage.sections.protocolDependencyTechnicalRisks.finalBody')}</Text>

        <Text style={styles.heading}>{t('termsPage.sections.prohibitedUse.heading')}</Text>
        <Text style={styles.body}>{t('termsPage.sections.prohibitedUse.body')}</Text>
        <Text style={styles.body}>{t('termsPage.sections.prohibitedUse.restrictedJurisdictions')}</Text>
        <Text style={styles.body}>{t('termsPage.sections.prohibitedUse.marketManipulation')}</Text>
        <Text style={styles.body}>{t('termsPage.sections.prohibitedUse.exploitBugs')}</Text>
        <Text style={styles.body}>{t('termsPage.sections.prohibitedUse.moneyLaundering')}</Text>
        <Text style={styles.body}>{t('termsPage.sections.prohibitedUse.violateLaws')}</Text>
        <Text style={styles.body}>{t('termsPage.sections.prohibitedUse.finalBody')}</Text>

        <Text style={styles.heading}>{t('termsPage.sections.limitationOfLiability.heading')}</Text>
        <Text style={styles.body}>{t('termsPage.sections.limitationOfLiability.body')}</Text>
        <Text style={styles.body}>{t('termsPage.sections.limitationOfLiability.tradingLosses')}</Text>
        <Text style={styles.body}>{t('termsPage.sections.limitationOfLiability.userError')}</Text>
        <Text style={styles.body}>{t('termsPage.sections.limitationOfLiability.oracleFailure')}</Text>
        <Text style={styles.body}>{t('termsPage.sections.limitationOfLiability.indirectDamages')}</Text>
        <Text style={styles.body}>{t('termsPage.sections.limitationOfLiability.finalBody')}</Text>

        <Text style={styles.heading}>{t('termsPage.sections.indemnification.heading')}</Text>
        <Text style={styles.body}>{t('termsPage.sections.indemnification.body')}</Text>
        <Text style={styles.body}>{t('termsPage.sections.indemnification.breachTerms')}</Text>
        <Text style={styles.body}>{t('termsPage.sections.indemnification.tradingActivity')}</Text>
        <Text style={styles.body}>{t('termsPage.sections.indemnification.violationLaw')}</Text>
        <Text style={styles.body}>{t('termsPage.sections.indemnification.negligence')}</Text>

        <Text style={styles.heading}>{t('termsPage.sections.modificationsTermination.heading')}</Text>
        <Text style={styles.body}>{t('termsPage.sections.modificationsTermination.body')}</Text>

        <Text style={styles.heading}>{t('termsPage.sections.governingLawDisputeResolution.heading')}</Text>
        <Text style={styles.body}>{t('termsPage.sections.governingLawDisputeResolution.body')}</Text>

        <Text style={styles.heading}>{t('termsPage.sections.severabilityEntireAgreement.heading')}</Text>
        <Text style={styles.body}>{t('termsPage.sections.severabilityEntireAgreement.body')}</Text>

        <Text style={styles.heading}>{t('termsPage.sections.reverseSolicitationEU.heading')}</Text>
        <Text style={styles.body}>{t('termsPage.sections.reverseSolicitationEU.body')}</Text>

        <Text style={styles.heading}>{t('termsPage.sections.acknowledgmentOfUnderstanding.heading')}</Text>
        <Text style={styles.body}>{t('termsPage.sections.acknowledgmentOfUnderstanding.body')}</Text>

        <Text style={styles.heading}>{t('termsPage.sections.contact.heading')}</Text>
        <Text style={styles.body}>{t('termsPage.sections.contact.body')}</Text>
        <Text style={styles.body}>{t('termsPage.sections.contact.companyName')}</Text>
        <Text style={styles.body}>{t('termsPage.sections.contact.address')}</Text>
        <Text style={styles.body}>{t('termsPage.sections.contact.email')}</Text>
        <Text style={styles.body}>{t('termsPage.sections.contact.phone')}</Text>
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
  link: { color: colors.accent.gold, textDecorationLine: 'underline' },
});
