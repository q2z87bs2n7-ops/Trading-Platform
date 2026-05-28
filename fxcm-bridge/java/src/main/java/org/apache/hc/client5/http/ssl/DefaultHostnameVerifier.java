package org.apache.hc.client5.http.ssl;

import org.apache.hc.client5.http.psl.PublicSuffixMatcher;

import javax.net.ssl.HostnameVerifier;
import javax.net.ssl.SSLSession;

/**
 * No-op replacement for HC5's DefaultHostnameVerifier.
 * FCLite hardcodes api-demo.fxcm.com but the server cert is for *.fxcorporate.com;
 * this bypasses hostname verification so the hosts-file redirect works.
 */
public final class DefaultHostnameVerifier implements HostnameVerifier {

    public static final DefaultHostnameVerifier INSTANCE = new DefaultHostnameVerifier();

    public DefaultHostnameVerifier() {}

    public DefaultHostnameVerifier(PublicSuffixMatcher ignored) {}

    @Override
    public boolean verify(String hostname, SSLSession session) {
        return true;
    }
}
