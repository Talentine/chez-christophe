/**
 * Marchéo · Export du compte Google Ads vers une feuille Google Sheets.
 *
 * LECTURE SEULE : ce script ne modifie rien dans le compte.
 * Il crée une feuille « Marchéo - Export Google Ads <date> » avec un onglet par
 * rapport (30 derniers jours), puis la partage avec l'adresse PARTAGER_AVEC.
 *
 * À coller dans Google Ads : Outils → Actions groupées → Scripts → « + » →
 * Nouveau script, puis Autoriser et Exécuter.
 */

var PARTAGER_AVEC = 'marcheo.contact@gmail.com'; // laisser '' pour ne partager avec personne
var PERIODE = 'LAST_30_DAYS';

var M = 'metrics.impressions, metrics.clicks, metrics.cost_micros, metrics.conversions, metrics.conversions_value';

var RAPPORTS = {
  Campagnes:
    'SELECT campaign.id, campaign.name, campaign.status, campaign.advertising_channel_type, ' +
    'campaign.bidding_strategy_type, campaign_budget.amount_micros, ' +
    'campaign.network_settings.target_google_search, campaign.network_settings.target_search_network, ' +
    'campaign.network_settings.target_content_network, ' +
    'campaign.geo_target_type_setting.positive_geo_target_type, ' + M + ', ' +
    'metrics.search_impression_share, metrics.search_budget_lost_impression_share, ' +
    'metrics.search_rank_lost_impression_share ' +
    'FROM campaign WHERE campaign.status != "REMOVED" AND segments.date DURING ' + PERIODE,

  GroupesAnnonces:
    'SELECT campaign.name, ad_group.id, ad_group.name, ad_group.status, ad_group.cpc_bid_micros, ' + M + ' ' +
    'FROM ad_group WHERE ad_group.status != "REMOVED" AND segments.date DURING ' + PERIODE,

  MotsCles:
    'SELECT campaign.name, ad_group.name, ad_group_criterion.criterion_id, ' +
    'ad_group_criterion.keyword.text, ad_group_criterion.keyword.match_type, ad_group_criterion.status, ' +
    'ad_group_criterion.quality_info.quality_score, ad_group_criterion.effective_cpc_bid_micros, ' + M + ' ' +
    'FROM keyword_view WHERE ad_group_criterion.status != "REMOVED" AND segments.date DURING ' + PERIODE,

  TermesRecherche:
    'SELECT campaign.name, ad_group.name, search_term_view.search_term, search_term_view.status, ' + M + ' ' +
    'FROM search_term_view WHERE segments.date DURING ' + PERIODE + ' ORDER BY metrics.cost_micros DESC LIMIT 2000',

  Annonces:
    'SELECT campaign.name, ad_group.name, ad_group_ad.ad.id, ad_group_ad.ad.type, ad_group_ad.status, ' +
    'ad_group_ad.ad_strength, ad_group_ad.policy_summary.approval_status, ad_group_ad.ad.final_urls, ' +
    'ad_group_ad.ad.responsive_search_ad.headlines, ad_group_ad.ad.responsive_search_ad.descriptions, ' + M + ' ' +
    'FROM ad_group_ad WHERE ad_group_ad.status != "REMOVED" AND segments.date DURING ' + PERIODE,

  Conversions:
    'SELECT conversion_action.id, conversion_action.name, conversion_action.status, conversion_action.type, ' +
    'conversion_action.category, conversion_action.primary_for_goal, conversion_action.counting_type ' +
    'FROM conversion_action',

  MotsClesNegatifs:
    'SELECT campaign.name, campaign_criterion.keyword.text, campaign_criterion.keyword.match_type ' +
    'FROM campaign_criterion WHERE campaign_criterion.type = "KEYWORD" AND campaign_criterion.negative = TRUE',

  Zones:
    'SELECT campaign.name, campaign_criterion.type, campaign_criterion.negative, ' +
    'campaign_criterion.location.geo_target_constant, campaign_criterion.proximity.radius, ' +
    'campaign_criterion.proximity.radius_units, campaign_criterion.proximity.address.city_name ' +
    'FROM campaign_criterion WHERE campaign_criterion.type IN ("LOCATION", "PROXIMITY")',

  Extensions:
    'SELECT campaign.name, campaign_asset.field_type, campaign_asset.status, asset.type, asset.name, ' +
    'asset.sitelink_asset.link_text, asset.callout_asset.callout_text, asset.final_urls ' +
    'FROM campaign_asset WHERE campaign_asset.status != "REMOVED"',

  Appareils:
    'SELECT campaign.name, segments.device, ' + M + ' ' +
    'FROM campaign WHERE campaign.status != "REMOVED" AND segments.date DURING ' + PERIODE,

  JoursHeures:
    'SELECT campaign.name, segments.day_of_week, segments.hour, ' + M + ' ' +
    'FROM campaign WHERE campaign.status != "REMOVED" AND segments.date DURING ' + PERIODE,

  ParJour:
    'SELECT campaign.name, segments.date, ' + M + ' ' +
    'FROM campaign WHERE campaign.status != "REMOVED" AND segments.date DURING ' + PERIODE
};

function main() {
  var jour = Utilities.formatDate(new Date(), AdsApp.currentAccount().getTimeZone(), 'yyyy-MM-dd');
  var classeur = SpreadsheetApp.create('Marchéo - Export Google Ads ' + jour);
  var premier = classeur.getSheets()[0];
  premier.setName('Infos');
  premier.appendRow(['Compte', AdsApp.currentAccount().getCustomerId()]);
  premier.appendRow(['Devise', AdsApp.currentAccount().getCurrencyCode()]);
  premier.appendRow(['Période', PERIODE]);
  premier.appendRow(['Exporté le', jour]);
  premier.appendRow(['Note', 'Les montants « micros » sont à diviser par 1 000 000.']);

  for (var nom in RAPPORTS) {
    var onglet = classeur.insertSheet(nom);
    try {
      AdsApp.report(RAPPORTS[nom]).exportToSheet(onglet);
    } catch (e) {
      onglet.appendRow(['ERREUR', String(e)]);
      Logger.log(nom + ' : ' + e);
    }
  }

  if (PARTAGER_AVEC) {
    try { classeur.addEditor(PARTAGER_AVEC); } catch (e) { Logger.log('Partage impossible : ' + e); }
  }
  Logger.log('Feuille créée : ' + classeur.getUrl());
}
