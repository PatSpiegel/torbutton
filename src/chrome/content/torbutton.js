// status
var m_wasinited = false;
var m_prefs = false; // FIXME: make into singleton with rest of cached globals?
var m_jshooks = false;

var torbutton_pref_observer =
{
    register: function()
    {
        var pref_service = Components.classes["@mozilla.org/preferences-service;1"]
                                     .getService(Components.interfaces.nsIPrefBranchInternal);
        this._branch = pref_service.QueryInterface(Components.interfaces.nsIPrefBranchInternal);
        this._branch.addObserver("", this, false);
    },

    unregister: function()
    {
        if (!this._branch) return;
        this._branch.removeOberver("", this);
    },

    // topic:   what event occurred
    // subject: what nsIPrefBranch we're observing
    // data:    which pref has been changed (relative to subject)
    observe: function(subject, topic, data)
    {
        if (topic != "nsPref:changed") return;
        switch (data) {
            case "extensions.torbutton.display_panel":
                torbutton_set_panel_view();
                break;
            case "extensions.torbutton.panel_style":
                torbutton_set_panel_style();
                break;
            case "extensions.torbutton.http_proxy":
            case "extensions.torbutton.http_port":
            case "extensions.torbutton.https_proxy":
            case "extensions.torbutton.https_port":
            case "extensions.torbutton.ftp_proxy":
            case "extensions.torbutton.ftp_port":
            case "extensions.torbutton.gopher_proxy":
            case "extensions.torbutton.gopher_port":
            case "extensions.torbutton.socks_host":
            case "extensions.torbutton.socks_port":
                torbutton_init_prefs();
            case "network.proxy.http":
            case "network.proxy.http_port":
            case "network.proxy.ssl":
            case "network.proxy.ssl_port":
            case "network.proxy.ftp":
            case "network.proxy.ftp_port":
            case "network.proxy.gopher":
            case "network.proxy.gopher_port":
            case "network.proxy.socks":
            case "network.proxy.socks_port":
            case "network.proxy.socks_version":
            case "network.proxy.share_proxy_settings":
            case "network.proxy.socks_remote_dns":
            case "network.proxy.type":
                torbutton_set_status();
                break;
        }
    }
}

function torbutton_set_panel_view() {
    var o_statuspanel = false;
    var o_prefbranch = false;

    o_statuspanel = torbutton_get_statuspanel();
    o_prefbranch = torbutton_get_prefbranch('extensions.torbutton.');
    if (!o_statuspanel || !o_prefbranch) return;

    var display_panel = o_prefbranch.getBoolPref('display_panel');
    torbutton_log(4, 'setting panel visibility');
    o_statuspanel.setAttribute('collapsed', !display_panel);
}

function torbutton_set_panel_style() {
    var o_statuspanel = false;
    var o_prefbranch = false;

    o_statuspanel = torbutton_get_statuspanel();
    o_prefbranch = torbutton_get_prefbranch('extensions.torbutton.');
    if (!o_statuspanel || !o_prefbranch) return;

    var panel_style = o_prefbranch.getCharPref('panel_style');
    torbutton_log(4, 'setting panel style: ' + panel_style);
    o_statuspanel.setAttribute('class','statusbarpanel-' + panel_style);
}

function torbutton_toggle() {
    var o_toolbutton = false;
    o_toolbutton = torbutton_get_toolbutton();

    torbutton_log(1, 'called toggle()');
    if (!m_wasinited) {
        torbutton_init();
    }

    if (torbutton_check_status()) {
        torbutton_disable_tor();
    } else {
        torbutton_enable_tor();
    }
}

function torbutton_set_status() {
    if (torbutton_check_status()) {
        torbutton_log(1,'status: tor is enabled');
        torbutton_update_status(true);
    } else {
        torbutton_log(1,'status: tor is disabled');
        torbutton_update_status(false);
    }
}

// load localization strings
function torbutton_get_stringbundle()
{
    var o_stringbundle = false;

    try {
        var oBundle = Components.classes["@mozilla.org/intl/stringbundle;1"]
                                .getService(Components.interfaces.nsIStringBundleService);
        o_stringbundle = oBundle.createBundle("chrome://torbutton/locale/torbutton.properties");
    } catch(err) {
        o_stringbundle = false;
    }
    if (!o_stringbundle) {
        torbutton_log(1, 'ERROR (init): failed to find torbutton-bundle');
    }

    return o_stringbundle;
}



function torbutton_init_toolbutton(event)
{
    if (event.originalTarget && event.originalTarget.getAttribute('id') == 'torbutton-button')
       torbutton_update_toolbutton(torbutton_check_status());
}

function torbutton_init() {
    torbutton_log(1, 'called init()');
    
    // initialize preferences before we start our prefs observer
    torbutton_init_prefs();

    // set panel style from preferences
    torbutton_set_panel_style();

    // listen for our toolbar button being added so we can initialize it
    if (geckoVersionCompare("1.8") <= 0) {
        document.getElementById('navigator-toolbox')
                .addEventListener('DOMNodeInserted', torbutton_init_toolbutton, false);
    }

    if (!m_wasinited) {
        m_prefs =  Components.classes["@mozilla.org/preferences-service;1"]
                        .getService(Components.interfaces.nsIPrefService);

        torbutton_init_pluginbutton();
        torbutton_init_jshooks();

        torbutton_log(5, 'registering pref observer');
        torbutton_pref_observer.register();
        m_wasinited = true;
    } else {
        torbutton_log(5, 'skipping pref observer init');
    }
    
    torbutton_set_panel_view();
    torbutton_log(2, 'setting torbutton status from proxy prefs');
    torbutton_set_status();
    torbutton_log(2, 'init completed');
}

// this function duplicates a lot of code in preferences.js for deciding our
// recommended settings.  figure out a way to eliminate the redundancy.
// FIXME: Move it to torbutton_util.js
function torbutton_init_prefs() {
    var torprefs = false;
    var proxy_port;
    var proxy_host;
    torbutton_log(4, "called init_prefs()");
    torprefs = torbutton_get_prefbranch('extensions.torbutton.');

    // Privoxy is always recommended for Firefoxes not supporting socks_remote_dns
    if (!torbutton_check_socks_remote_dns())
        torprefs.setBoolPref('use_privoxy', true);

    if (torprefs.getBoolPref('use_privoxy'))
    {
        proxy_host = 'localhost';
        proxy_port = 8118;
    }
    else
    {
        proxy_host = '';
        proxy_port = 0;
    }

    if (torprefs.getCharPref('settings_method') == 'recommended')
    {
        torbutton_log(5, "using recommended settings");
        if (torbutton_check_socks_remote_dns())
        {
            torprefs.setCharPref('http_proxy', proxy_host);
            torprefs.setCharPref('https_proxy', proxy_host);
            torprefs.setCharPref('ftp_proxy', '');
            torprefs.setCharPref('gopher_proxy', '');
            torprefs.setIntPref('http_port', proxy_port);
            torprefs.setIntPref('https_port', proxy_port);
            torprefs.setIntPref('ftp_port', 0);
            torprefs.setIntPref('gopher_port', 0);
        } else {
            torprefs.setCharPref('http_proxy', proxy_host);
            torprefs.setCharPref('https_proxy', proxy_host);
            torprefs.setCharPref('ftp_proxy', proxy_host);
            torprefs.setCharPref('gopher_proxy', proxy_host);
            torprefs.setIntPref('http_port', proxy_port);
            torprefs.setIntPref('https_port', proxy_port);
            torprefs.setIntPref('ftp_port', proxy_port);
            torprefs.setIntPref('gopher_port', proxy_port);
        }
        torprefs.setCharPref('socks_host', 'localhost');
        torprefs.setIntPref('socks_port', 9050);
    }

    torbutton_log(1, 'http_port='+torprefs.getIntPref('http_port'));
    // m_prefs.setCharPref('extensions.torbutton.http_proxy',   m_http_proxy);
    // m_prefs.setIntPref('extensions.torbutton.http_port',     m_http_port);
    // m_prefs.setCharPref('extensions.torbutton.https_proxy',  m_https_proxy);
    // m_prefs.setIntPref('extensions.torbutton.https_port',    m_https_port);
    // m_prefs.setCharPref('extensions.torbutton.ftp_proxy',    m_ftp_proxy);
    // m_prefs.setIntPref('extensions.torbutton.ftp_port',      m_ftp_port);
    // m_prefs.setCharPref('extensions.torbutton.gopher_proxy', m_gopher_proxy);
    // m_prefs.setIntPref('extensions.torbutton.gopher_port',   m_gopher_port);
    // m_prefs.setCharPref('extensions.torbutton.socks_host',   m_socks_host);
    // m_prefs.setIntPref('extensions.torbutton.socks_port',    m_socks_port);
}

function torbutton_get_toolbutton() {
    var o_toolbutton = false;

    torbutton_log(4, 'get_toolbutton(): looking for button element');
    if (document.getElementById("torbutton-button")) {
        o_toolbutton = document.getElementById("torbutton-button");
    } else if (document.getElementById("torbutton-button-tb")) {
        o_toolbutton = document.getElementById("torbutton-button-tb");
    } else if (document.getElementById("torbutton-button-tb-msg")) {
        o_toolbutton = document.getElementById("torbutton-button-tb-msg");
    } else {
        torbutton_log(1, 'get_toolbutton(): did not find torbutton-button');
    }

    return o_toolbutton;
}

function torbutton_get_statuspanel() {
    var o_statuspanel = false;

    torbutton_log(4, 'init_statuspanel(): looking for statusbar element');
    if (document.getElementById("torbutton-panel")) {
        o_statuspanel = document.getElementById("torbutton-panel");
    } else {
        torbutton_log(1, 'ERROR (init): failed to find torbutton-panel');
    }

    return o_statuspanel;
}

function torbutton_save_nontor_settings()
{
  var liveprefs = false;
  var savprefs = false;

  liveprefs = torbutton_get_prefbranch('network.proxy.');
  savprefs = torbutton_get_prefbranch('extensions.torbutton.saved.');
  if (!liveprefs || !savprefs) return;

  savprefs.setIntPref('type',          liveprefs.getIntPref('type'));
  savprefs.setCharPref('http_proxy',   liveprefs.getCharPref('http'));
  savprefs.setIntPref('http_port',     liveprefs.getIntPref('http_port'));
  savprefs.setCharPref('https_proxy',  liveprefs.getCharPref('ssl'));
  savprefs.setIntPref('https_port',    liveprefs.getIntPref('ssl_port'));
  savprefs.setCharPref('ftp_proxy',    liveprefs.getCharPref('ftp'));
  savprefs.setIntPref('ftp_port',      liveprefs.getIntPref('ftp_port'));
  savprefs.setCharPref('gopher_proxy', liveprefs.getCharPref('gopher'));
  savprefs.setIntPref('gopher_port',   liveprefs.getIntPref('gopher_port'));
  savprefs.setCharPref('socks_host',   liveprefs.getCharPref('socks'));
  savprefs.setIntPref('socks_port',    liveprefs.getIntPref('socks_port'));
  savprefs.setIntPref('socks_version', liveprefs.getIntPref('socks_version'));
  try { // ff-0.9 doesn't have share_proxy_settings
    savprefs.setBoolPref('share_proxy_settings', liveprefs.getBoolPref('share_proxy_settings'));
  } catch(e) {}
  if (torbutton_check_socks_remote_dns())
    savprefs.setBoolPref('socks_remote_dns',     liveprefs.getBoolPref('socks_remote_dns'));
}

function torbutton_restore_nontor_settings()
{
  var liveprefs = false;
  var savprefs = false;

  liveprefs = torbutton_get_prefbranch('network.proxy.');
  savprefs = torbutton_get_prefbranch('extensions.torbutton.saved.');
  if (!liveprefs || !savprefs) return;

  liveprefs.setIntPref('type',          savprefs.getIntPref('type'));
  liveprefs.setCharPref('http',         savprefs.getCharPref('http_proxy'));
  liveprefs.setIntPref('http_port',     savprefs.getIntPref('http_port'));
  liveprefs.setCharPref('ssl',          savprefs.getCharPref('https_proxy'));
  liveprefs.setIntPref('ssl_port',      savprefs.getIntPref('https_port'));
  liveprefs.setCharPref('ftp',          savprefs.getCharPref('ftp_proxy'));
  liveprefs.setIntPref('ftp_port',      savprefs.getIntPref('ftp_port'));
  liveprefs.setCharPref('gopher',       savprefs.getCharPref('gopher_proxy'));
  liveprefs.setIntPref('gopher_port',   savprefs.getIntPref('gopher_port'));
  liveprefs.setCharPref('socks',        savprefs.getCharPref('socks_host'));
  liveprefs.setIntPref('socks_port',    savprefs.getIntPref('socks_port'));
  liveprefs.setIntPref('socks_version', savprefs.getIntPref('socks_version'));
  try { // ff-0.9 doesn't have share_proxy_settings
    liveprefs.setBoolPref('share_proxy_settings', savprefs.getBoolPref('share_proxy_settings'));
  } catch(e) {}
  if (torbutton_check_socks_remote_dns())
    liveprefs.setBoolPref('socks_remote_dns',     savprefs.getBoolPref('socks_remote_dns'));
    
  // XXX: hrmm..
  var torprefs = torbutton_get_prefbranch('extensions.torbutton.');

  if(torprefs.getBoolPref("no_tor_plugins")) {
    torprefs.setBoolPref("allow_plugins", true);
  }
}

function torbutton_disable_tor()
{
  torbutton_log(2, 'called disable_tor()');
  torbutton_restore_nontor_settings();
}

function torbutton_enable_tor()
{
  torbutton_log(2, 'called enable_tor()');

  torbutton_save_nontor_settings();
  torbutton_activate_tor_settings();
}

function torbutton_update_toolbutton(mode)
{
  o_toolbutton = torbutton_get_toolbutton();
  if (!o_toolbutton) return;
  // XXX: This is a global... elsewhere too
  o_stringbundle = torbutton_get_stringbundle();

  if (mode) {
      tooltip = o_stringbundle.GetStringFromName("torbutton.button.tooltip.enabled");
      o_toolbutton.setAttribute('tbstatus', 'on');
      o_toolbutton.setAttribute('tooltiptext', tooltip);
  } else {
      tooltip = o_stringbundle.GetStringFromName("torbutton.button.tooltip.disabled");
      o_toolbutton.setAttribute('tbstatus', 'off');
      o_toolbutton.setAttribute('tooltiptext', tooltip);
  }
}

function torbutton_update_statusbar(mode)
{
    o_statuspanel = torbutton_get_statuspanel();
    if (!window.statusbar.visible) return;
    o_stringbundle = torbutton_get_stringbundle();

    if (mode) {
        label   = o_stringbundle.GetStringFromName("torbutton.panel.label.enabled");
        tooltip = o_stringbundle.GetStringFromName("torbutton.panel.tooltip.enabled");
        o_statuspanel.style.color = "#390";
        o_statuspanel.setAttribute('label', label);
        o_statuspanel.setAttribute('tooltiptext', tooltip);
        o_statuspanel.setAttribute('tbstatus', 'on');
    } else {
        label   = o_stringbundle.GetStringFromName("torbutton.panel.label.disabled");
        tooltip = o_stringbundle.GetStringFromName("torbutton.panel.tooltip.disabled");
        o_statuspanel.style.color = "#F00";
        o_statuspanel.setAttribute('label', label);
        o_statuspanel.setAttribute('tooltiptext', tooltip);
        o_statuspanel.setAttribute('tbstatus', 'off');
    }
}

function torbutton_update_status(mode) {
    var o_toolbutton = false;
    var o_statuspanel = false;
    var o_stringbundle = false;
    var sPrefix;
    var label;
    var tooltip;
    
    var torprefs = torbutton_get_prefbranch('extensions.torbutton.');
    torprefs.setBoolPref('tor_enabled', mode);

    torbutton_log(2, 'called update_status('+mode+')');
    torbutton_update_toolbutton(mode);
    torbutton_update_statusbar(mode);
    torbutton_update_plugin_status(!mode);

    if (torprefs.getBoolPref('clear_history')) {
        ClearHistory();
    }

    // XXX: Offer option of cookie jars vs clearing cookies
    // Clearing cookies should be the default (Fuck cookies ;)
    if (torprefs.getBoolPref('clear_cookies')) {
        ClearCookies(mode);
    }
}

function torbutton_open_prefs_dialog() {
    window.openDialog("chrome://torbutton/content/preferences.xul","torbutton-preferences","centerscreen, chrome");
    torbutton_log(3, 'opened preferences window');
}

function torbutton_open_about_dialog() {
    var extensionManager = Components.classes["@mozilla.org/extensions/manager;1"]
                           .getService(Components.interfaces.nsIExtensionManager);
    var database = '@mozilla.org/rdf/datasource;1?name=composite-datasource';
    var extension_id = '';
    database = Components.classes[database]
               .getService(Components.interfaces.nsIRDFCompositeDataSource);
    database.AddDataSource(extensionManager.datasource);

    if (geckoVersionCompare("1.8") <= 0)
    {
        // Firefox 1.5 -- use built-in about box
        extension_id = "urn:mozilla:item:{e0204bd5-9d31-402b-a99d-a6aa8ffebdca}";
        window.openDialog("chrome://mozapps/content/extensions/about.xul","","chrome",extension_id,database);
    } else {
        // Firefox 1.0 -- home page link is broken in built-in about box, use our own
        extension_id = "urn:mozilla:extension:{e0204bd5-9d31-402b-a99d-a6aa8ffebdca}";
        window.openDialog("chrome://torbutton/content/about.xul","","chrome",extension_id,database);
    }
}

function torbutton_about_init() {
    var extensionID = window.arguments[0];
    var extensionDB = window.arguments[1];

    var oBundle = Components.classes["@mozilla.org/intl/stringbundle;1"]
                            .getService(Components.interfaces.nsIStringBundleService);
    var extensionsStrings = document.getElementById("extensionsStrings");

    var rdfs = Components.classes["@mozilla.org/rdf/rdf-service;1"]
                         .getService(Components.interfaces.nsIRDFService);
    var extension = rdfs.GetResource(extensionID);

    var versionArc = rdfs.GetResource("http://www.mozilla.org/2004/em-rdf#version");
    var version = extensionDB.GetTarget(extension, versionArc, true);
    version = version.QueryInterface(Components.interfaces.nsIRDFLiteral).Value;

    var extensionVersion = document.getElementById("torbuttonVersion");

    extensionVersion.setAttribute("value", extensionsStrings.getFormattedString("aboutWindowVersionString", [version]));
}

function geckoVersionCompare(aVersion) {
    var ioService = Components.classes["@mozilla.org/network/io-service;1"]
                    .getService(Components.interfaces.nsIIOService);
    var httpProtocolHandler = ioService.getProtocolHandler("http")
                              .QueryInterface(Components.interfaces.nsIHttpProtocolHandler);
    var versionComparator = null;

    if ("nsIVersionComparator" in Components.interfaces) {
        versionComparator = Components.classes["@mozilla.org/xpcom/version-comparator;1"]
                            .getService(Components.interfaces.nsIVersionComparator);
    } else {
        versionComparator = Components.classes["@mozilla.org/updates/version-checker;1"]
                            .getService(Components.interfaces.nsIVersionChecker);
    }
    var geckoVersion = httpProtocolHandler.misc.match(/rv:([0-9.]+)/)[1];
    return versionComparator.compare(aVersion, geckoVersion);
}

function torbutton_browser_proxy_prefs_init()
{
  var _elementIDs = ["networkProxyType",
                     "networkProxyFTP", "networkProxyFTP_Port",
                     "networkProxyGopher", "networkProxyGopher_Port",
                     "networkProxyHTTP", "networkProxyHTTP_Port",
                     "networkProxySOCKS", "networkProxySOCKS_Port",
                     "networkProxySOCKSVersion",
                     "networkProxySOCKSVersion4", "networkProxySOCKSVersion5",
                     "networkProxySSL", "networkProxySSL_Port",
                     "networkProxyNone", "networkProxyAutoconfigURL", "shareAllProxies"];

  torbutton_log(3, 'called torbutton_browser_proxy_prefs_init()');
  if (!torbutton_check_status())
  {
    document.getElementById('torbutton-pref-connection-notice').hidden = true;
    document.getElementById('torbutton-pref-connection-more-info').hidden = true;
  }
  else
  {
    document.getElementById('networkProxyType').disabled = true;
    for (i = 0; i < _elementIDs.length; i++)
        document.getElementById(_elementIDs[i]).setAttribute( "disabled", "true" );
  }

  // window.sizeToContent();
}

// -------------- HISTORY & COOKIES ---------------------

function SaveHistory() {
    // FIXME: This is documented, but not implemented :(
    torbutton_log(2, 'called SaveHistory');
    var saver = Components.classes["@mozilla.org/browser/global-history;2"]
                    .getService(Components.interfaces.nsIRDFRemoteDataSource);
    saver.FlushTo("TorButton_prehistory.rdf");
}

function LoadHistory() {
    // FIXME: This is documented, but not implemented :(
    torbutton_log(2, 'called LoadHistory');
    var loader = Components.classes["@mozilla.org/browser/global-history;2"]
                    .getService(Components.interfaces.nsIRDFRemoteDataSource);
    loader.Init("TorButton_prehistory.rdf");
    loader.Refresh(true);
}

function ClearHistory() {
    torbutton_log(2, 'called ClearHistory');
    var hist = Components.classes["@mozilla.org/browser/global-history;2"]
                    .getService(Components.interfaces.nsIBrowserHistory);
    hist.removeAllPages();    
}

function ClearCookies(mode) {
    torbutton_log(2, 'called ClearCookies');
    var cm = Components.classes["@mozilla.org/cookiemanager;1"]
                    .getService(Components.interfaces.nsICookieManager);
    
    // XXX: Check pref to fully clear or not
    //cm.removeAll();

    var selector =
          Components.classes["@stanford.edu/cookie-jar-selector;1"]
                    .getService(Components.interfaces.nsISupports)
                    .wrappedJSObject;
    if(mode) {
        selector.saveCookies("nontor");
        selector.clearCookies();
    } else {
        // Never save tor cookies
        selector.clearCookies();
        selector.loadCookies("nontor", false);
    }
}


// -------------- JS/PLUGIN HANDLING CODE ---------------------

function TagDocshellForJS(browser, allowed) {
    if (typeof(browser.__tb_js_state) == 'undefined') {
        //@JSD_BREAK
        torbutton_log(5, "UNTAGGED WINDOW!!!!!!!!!");
    }

    if(browser.__tb_js_state == allowed) {
        // States match, js ok 
        browser.docShell.allowJavascript = 
            m_prefs.getBoolPref("javascript.enabled");
    } else {
        // States differ or undefined, js not ok 
        browser.docShell.allowJavascript = false;
    }
}

function torbutton_allow_win_jsplugins(win, allowed) {
    var browser = win.getBrowser();

    browser.docShell.allowPlugins = allowed;
    TagDocshellForJS(browser, allowed);

    var browsers = browser.browsers;

    for (var i = 0; i < browsers.length; ++i) {
        var b = browser.browsers[i];
        if (b) {
            b.docShell.allowPlugins = allowed;
            TagDocshellForJS(b, allowed);
        }
    }
}

// This is an ugly beast.. But unfortunately it has to be so..
// Looping over all tabs twice is not somethign we wanna do..
function torbutton_allow_jsplugins(allowed) {
    torbutton_log(1, "Plugins: "+allowed);
    var wm = Components.classes["@mozilla.org/appshell/window-mediator;1"]
                       .getService(Components.interfaces.nsIWindowMediator);

    var enumerator = wm.getEnumerator("navigator:browser");
    while(enumerator.hasMoreElements()) {
        var win = enumerator.getNext();
        torbutton_allow_win_jsplugins(win, allowed);   
    }
}

function torbutton_init_pluginbutton() {
    torbutton_update_plugin_status(!torbutton_check_status());
}


function torbutton_update_plugin_status(nMode) {
    torbutton_log(2, 'called update_plugin_status('+nMode+')');
    if (!window.statusbar.visible)
        return;
    torbutton_log(2, 'visible statusbar: ('+nMode+')');
    var o_stringbundle = torbutton_get_stringbundle();
    var override = !m_prefs.getBoolPref("extensions.torbutton.no_tor_plugins");
    var tooltip;

    if(override) nMode = true;

    if(nMode) {
        tooltip = o_stringbundle.GetStringFromName("torbutton.panel.plugins.enabled");
    } else {
        tooltip = o_stringbundle.GetStringFromName("torbutton.panel.plugins.disabled");
    }
  
    // FIXME: hrmm.. consider caching this value
    document.getElementById("plugins-status").setAttribute("status", nMode ?  "1" : "0");
    document.getElementById("plugins-status").setAttribute('tooltiptext', tooltip);

    if(override) return;

    // XXX: Don't set these to true if user had it off to begin with!
    m_prefs.setBoolPref("security.enable_java", nMode);
    m_prefs.setBoolPref("extensions.update.enabled", nMode);
    
    // FIXME: Allow option to kill all JS during tor usage. 
    torbutton_allow_jsplugins(nMode);
}

// ---------------------- Event handlers -----------------

function NewTabEvent(event)
{ 
    // listening for new tabs
    torbutton_log(1, "New tab");

    // Fucking garbage.. event is delivered to the current tab, not the 
    // newly created one. Need to traverse the current window for it.
    if(m_prefs.getBoolPref("extensions.torbutton.tor_enabled") 
            && m_prefs.getBoolPref("extensions.torbutton.no_tor_plugins")) {
        var wm = Components.classes["@mozilla.org/appshell/window-mediator;1"]
            .getService(Components.interfaces.nsIWindowMediator);
        var browserWindow = wm.getMostRecentWindow("navigator:browser");  
        torbutton_allow_win_jsplugins(browserWindow, false);
    }
}

// XXX: Does this get the first window?
function NewWindowEvent(event)
{
    if (!m_wasinited) {
        torbutton_init();
    }
    torbutton_log(1, "New window");

    if (torbutton_check_status()) {
        if(m_prefs.getBoolPref("extensions.torbutton.no_tor_plugins")) {
            getBrowser().docShell.allowPlugins = false;
        }
        TagDocshellForJS(getBrowser(), false, false);
    } else {
        TagDocshellForJS(getBrowser(), true, true);
    }


    getBrowser().addProgressListener(myListener,
      Components.interfaces.nsIWebProgress.NOTIFY_STATE_DOCUMENT|
      Components.interfaces.nsIWebProgress.NOTIFY_LOCATION);
}

window.addEventListener('load',NewWindowEvent,false);
getBrowser().addEventListener("TabOpen", NewTabEvent, false);


// ----------- JAVASCRIPT HOOKING + EVENT HANDLERS ----------------

function torbutton_init_jshooks() {
    torbutton_log(1, "torbutton_init_jshooks()");
    var nsio = Components.classes["@mozilla.org/network/io-service;1"]
                .getService(Components.interfaces.nsIIOService);
    var chan = nsio.newChannel("chrome://torbutton/content/jshooks.js", 
                               null, null);
    var istream = Components.classes["@mozilla.org/scriptableinputstream;1"].
            createInstance(Components.interfaces.nsIScriptableInputStream);

    istream.init(chan.open());
    m_jshooks = istream.read(istream.available());
    istream.close();
}

function getBody(doc) {
    if (doc.body)
        return doc.body;
    else if (doc.documentElement)
        return doc.documentElement;
    return null;
}

function hookDoc(win, doc) {
    torbutton_log(1, "Hooking document");
    if (!m_wasinited) {
        torbutton_init();
    }

    if(typeof(win.__tb_did_hook) != 'undefined')
        return; // Ran already
    
    win.__tb_did_hook = true;

    torbutton_log(1, "JS to be set to: " +m_prefs.getBoolPref("javascript.enabled"));
    var browser = getBrowser();
    var tor_tag = !m_prefs.getBoolPref("extensions.torbutton.tor_enabled");
    var js_enabled = m_prefs.getBoolPref("javascript.enabled");

    // Find proper browser for this document.. ugh.
    for (var i = 0; i < browser.browsers.length; ++i) {
        var b = browser.browsers[i];
        if (b && b.contentDocument == doc) {
            b.__tb_js_state = tor_tag;
            b.docShell.allowJavascript = js_enabled;
        }
    }

    torbutton_log(1, "JS set to: " 
        + m_prefs.getBoolPref("javascript.enabled"));

    // No need to hook js if tor is off, right?
    if(!m_prefs.getBoolPref("extensions.torbutton.tor_enabled") 
            || !m_prefs.getBoolPref('extensions.torbutton.kill_bad_js'))
        return;

    var str = "<"+"script>";
    str += m_jshooks; 
//    str +="alert(\"hi\");";
    str += "</"+"script>";
    var d = doc.createElement("div");
    d.style.visibility = 'hidden';
    d.innerHTML = str;
    getBody(doc).insertBefore(d, getBody(doc).firstChild);
}

const STATE_START = Components.interfaces.nsIWebProgressListener.STATE_START;
const STATE_STOP = Components.interfaces.nsIWebProgressListener.STATE_STOP;
var myListener =
{
  QueryInterface: function(aIID)
  {
   if (aIID.equals(Components.interfaces.nsIWebProgressListener) ||
       aIID.equals(Components.interfaces.nsISupportsWeakReference) ||
       aIID.equals(Components.interfaces.nsISupports))
     return this;
   throw Components.results.NS_NOINTERFACE;
  },

  onStateChange: function(aProgress, aRequest, aFlag, aStatus)
  { /*torbutton_log(1, 'State change()'); */return 0; },

  onLocationChange: function(aProgress, aRequest, aURI)
  {
    torbutton_log(1, 'onLocationChange');
   // This fires when the location bar changes i.e load event is confirmed
   // or when the user switches tabs
    if(aProgress) {
        torbutton_log(1, "location progress");
        // XXX: Check mimetype or DOM to not fuck with .txt files and other
        // formats..
        var doc = aProgress.DOMWindow.document;
        if(doc) hookDoc(aProgress.DOMWindow, doc);        
        else torbutton_log(3, "No DOM at location event!");
    } else {
        torbutton_log(3, "No aProgress for location!");
    }
    return 0;
  },

  onProgressChange: function(webProgress, request, curSelfProgress, maxSelfProgress, curTotalProgress, maxTotalProgress) 
  { /* torbutton_log(1, 'called progressChange'); */ return 0; },
  
  onStatusChange: function() 
  { /*torbutton_log(1, 'called statusChange'); */ return 0; },
  
  onSecurityChange: function() {return 0;},
  
  onLinkIconAvailable: function() 
  { /*torbutton_log(1, 'called linkIcon'); */ return 0; }
}


//vim:set ts=4
