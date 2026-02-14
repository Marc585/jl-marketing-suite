<?php
/**
 * Plugin Name: J&L Marketing Suite – Artikelsuche
 * Description: Chatbasierte Artikelnummern-Suche für das Marketing Team. Shortcode: [jl_artikelsuche]
 * Version: 1.0.0
 * Author: Marc Böhle
 * Text Domain: jl-marketing-suite
 */

if (!defined('ABSPATH')) {
    exit;
}

define('JLMS_VERSION', '1.0.0');
define('JLMS_PLUGIN_URL', plugin_dir_url(__FILE__));
define('JLMS_PLUGIN_DIR', plugin_dir_path(__FILE__));

/**
 * Shortcode [jl_artikelsuche] – gibt die komplette Artikelsuche aus.
 */
function jlms_render_shortcode($atts) {
    // Styles und Scripts nur laden wenn Shortcode benutzt wird
    wp_enqueue_style('jlms-style', JLMS_PLUGIN_URL . 'assets/style.css', [], JLMS_VERSION);
    wp_enqueue_script('jlms-app', JLMS_PLUGIN_URL . 'assets/app.js', [], JLMS_VERSION, true);
    wp_localize_script('jlms-app', 'jlmsConfig', [
        'pluginUrl' => JLMS_PLUGIN_URL,
        'articlesUrl' => JLMS_PLUGIN_URL . 'data/articles.json',
    ]);

    ob_start();
    ?>
    <div id="jlms-root" class="jlms">
        <div class="jlms-container">
            <!-- Header -->
            <div class="jlms-header">
                <div class="jlms-header-left">
                    <svg class="jlms-logo" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/>
                    </svg>
                    <div>
                        <h2 class="jlms-title">Artikelsuche</h2>
                        <p class="jlms-subtitle">Marketing Suite</p>
                    </div>
                </div>
                <div class="jlms-stats">
                    <div class="jlms-stat">
                        <span class="jlms-stat-value" id="jlmsStatArticles">–</span>
                        <span class="jlms-stat-label">Artikel</span>
                    </div>
                    <div class="jlms-stat">
                        <span class="jlms-stat-value" id="jlmsStatCategories">–</span>
                        <span class="jlms-stat-label">Kategorien</span>
                    </div>
                    <div class="jlms-stat">
                        <span class="jlms-stat-value" id="jlmsDataDate">–</span>
                        <span class="jlms-stat-label">Stand</span>
                    </div>
                </div>
            </div>

            <!-- Chat Messages -->
            <div class="jlms-chat" id="jlmsChatMessages">
                <div class="message bot">
                    <div class="avatar">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/>
                        </svg>
                    </div>
                    <div class="bubble">
                        <div class="bubble-content">
                            <strong>Hey! 👋</strong><br>
                            Ich helfe dir, Artikelnummern zu finden. Frag mich einfach, z.B.:<br><br>
                            → „Lip Treatments"<br>
                            → „Shampoo Mango Matcha"<br>
                            → „Alle Kategorien"
                        </div>
                    </div>
                </div>
            </div>

            <!-- Quick Actions -->
            <div class="jlms-quick-actions" id="jlmsQuickActions">
                <button class="jlms-chip" data-query="Lippenpflege">Lippenpflege</button>
                <button class="jlms-chip" data-query="Shampoo">Shampoos</button>
                <button class="jlms-chip" data-query="Handseife">Handseifen</button>
                <button class="jlms-chip" data-query="Gesichtspflege">Gesichtspflege</button>
                <button class="jlms-chip" data-query="Rosemary Ginger">Rosemary Ginger</button>
                <button class="jlms-chip" data-query="Alle Kategorien">Alle Kategorien</button>
            </div>

            <!-- Input -->
            <div class="jlms-input-container">
                <div class="jlms-input-wrapper">
                    <input
                        type="text"
                        id="jlmsChatInput"
                        class="jlms-input"
                        placeholder="z.B. Welche Artikelnummern haben die Lip Treatments?"
                        autocomplete="off"
                    >
                    <button class="jlms-send-btn" id="jlmsSendBtn" title="Senden (Enter)">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/>
                        </svg>
                    </button>
                </div>
                <span class="jlms-input-hint">Enter zum Senden · Durchsucht Namen, Artikelnummern und Kategorien</span>
                <div class="jlms-made-with-love">Made with &hearts; for the Marketing Team</div>
            </div>
        </div>
    </div>
    <?php
    return ob_get_clean();
}

add_shortcode('jl_artikelsuche', 'jlms_render_shortcode');
