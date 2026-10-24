package net.shapecoach.app;

import android.app.Activity;
import android.content.ComponentName;
import android.content.Intent;
import android.os.Bundle;
import android.util.Log;

import androidx.annotation.Nullable;
import androidx.browser.trusted.Token;
import androidx.browser.trusted.TokenStore;

import com.android.billingclient.api.BillingClient;
import com.android.billingclient.api.BillingClientStateListener;
import com.android.billingclient.api.BillingFlowParams;
import com.android.billingclient.api.BillingResult;
import com.android.billingclient.api.PendingPurchasesParams;
import com.android.billingclient.api.ProductDetails;
import com.android.billingclient.api.Purchase;
import com.android.billingclient.api.PurchasesUpdatedListener;
import com.android.billingclient.api.QueryProductDetailsParams;
import com.google.androidbrowserhelper.playbilling.provider.MethodData;
import com.google.androidbrowserhelper.playbilling.provider.PaymentResult;
import com.google.androidbrowserhelper.trusted.ChromeOsSupport;
import com.google.androidbrowserhelper.trusted.SharedPreferencesTokenStore;

import java.util.Collections;
import java.util.List;

/**
 * Handles the website's Payment Request for a ShapeCoach Premium plan ("Subscribe" on the
 * Premium screen) by opening Google Play's purchase sheet.
 *
 * It replaces Android Browser Helper's PaymentActivity, which always buys the first offer
 * Google Play lists. When a plan has a free trial, that can be the plain base plan, so a person
 * offered "7 days free" would be charged straight away. This activity buys the free-trial offer
 * whenever Google Play lists one (Play only lists offers the person is eligible for), and the
 * base plan otherwise. Everything else follows PaymentActivity: only the verified browser of
 * this app's Trusted Web Activity may start a payment, and the result goes back to Chrome in
 * the same format.
 */
public class TrialPaymentActivity extends Activity implements PurchasesUpdatedListener {
    private static final String TAG = "ShapeCoachPayment";
    private static final String METHOD_NAME = "https://play.google.com/billing";

    private BillingClient mBillingClient;
    private String mProductId;
    private boolean mFinished;

    @Override
    protected void onCreate(@Nullable Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        ComponentName caller = getCallingActivity();
        if (caller == null) {
            fail("Must be launched with startActivityForResult.");
            return;
        }
        if (!isVerifiedCaller(caller.getPackageName())) {
            fail("Launching app is not verified.");
            return;
        }

        MethodData methodData = MethodData.fromIntent(getIntent());
        if (methodData == null) {
            fail("Could not parse product ID.");
            return;
        }
        mProductId = methodData.sku;
        Log.d(TAG, "Purchase requested for " + mProductId);

        mBillingClient = BillingClient.newBuilder(this)
                .setListener(this)
                .enablePendingPurchases(
                        PendingPurchasesParams.newBuilder().enableOneTimeProducts().build())
                .build();
        mBillingClient.startConnection(new BillingClientStateListener() {
            @Override
            public void onBillingSetupFinished(BillingResult result) {
                if (result.getResponseCode() == BillingClient.BillingResponseCode.OK) {
                    queryProduct();
                } else {
                    fail("Google Play Billing is unavailable: " + result.getDebugMessage());
                }
            }

            @Override
            public void onBillingServiceDisconnected() {
                fail("Google Play Billing disconnected.");
            }
        });
    }

    /** Same rule as Android Browser Helper's PaymentVerifier. */
    private boolean isVerifiedCaller(String packageName) {
        if (ChromeOsSupport.isRunningOnArc(getPackageManager())
                && ChromeOsSupport.ARC_PAYMENT_APP.equals(packageName)) {
            return true;
        }
        TokenStore tokenStore = new SharedPreferencesTokenStore(this);
        Token verified = tokenStore.load();
        return verified != null && verified.matches(packageName, getPackageManager());
    }

    private void queryProduct() {
        QueryProductDetailsParams params = QueryProductDetailsParams.newBuilder()
                .setProductList(Collections.singletonList(
                        QueryProductDetailsParams.Product.newBuilder()
                                .setProductId(mProductId)
                                .setProductType(BillingClient.ProductType.SUBS)
                                .build()))
                .build();
        mBillingClient.queryProductDetailsAsync(params, (result, detailsResult) -> {
            List<ProductDetails> list = detailsResult.getProductDetailsList();
            if (result.getResponseCode() != BillingClient.BillingResponseCode.OK
                    || list == null || list.isEmpty()) {
                fail("Google Play did not find " + mProductId + ": " + result.getDebugMessage());
                return;
            }
            runOnUiThread(() -> launchPurchase(list.get(0)));
        });
    }

    private void launchPurchase(ProductDetails product) {
        List<ProductDetails.SubscriptionOfferDetails> offers = product.getSubscriptionOfferDetails();
        if (offers == null || offers.isEmpty()) {
            fail("No subscription offers for " + mProductId);
            return;
        }
        ProductDetails.SubscriptionOfferDetails offer = chooseOffer(offers);
        Log.d(TAG, "Buying " + mProductId + " with "
                + (offer.getOfferId() == null ? "base plan " + offer.getBasePlanId() : "offer " + offer.getOfferId()));

        BillingFlowParams params = BillingFlowParams.newBuilder()
                .setProductDetailsParamsList(Collections.singletonList(
                        BillingFlowParams.ProductDetailsParams.newBuilder()
                                .setProductDetails(product)
                                .setOfferToken(offer.getOfferToken())
                                .build()))
                .build();
        BillingResult result = mBillingClient.launchBillingFlow(this, params);
        if (result.getResponseCode() != BillingClient.BillingResponseCode.OK) {
            fail("Could not open Google Play's purchase sheet: " + result.getDebugMessage());
        }
    }

    /**
     * The free-trial offer if Google Play lists one, else the base plan. Play lists only the
     * offers this person is eligible for, so a trial appears only for new subscribers.
     */
    static ProductDetails.SubscriptionOfferDetails chooseOffer(
            List<ProductDetails.SubscriptionOfferDetails> offers) {
        for (ProductDetails.SubscriptionOfferDetails offer : offers) {
            if (offer.getOfferId() != null && hasFreePhase(offer)) return offer;
        }
        for (ProductDetails.SubscriptionOfferDetails offer : offers) {
            if (offer.getOfferId() == null) return offer;
        }
        return offers.get(0);
    }

    private static boolean hasFreePhase(ProductDetails.SubscriptionOfferDetails offer) {
        for (ProductDetails.PricingPhase phase : offer.getPricingPhases().getPricingPhaseList()) {
            if (phase.getPriceAmountMicros() == 0) return true;
        }
        return false;
    }

    @Override
    public void onPurchasesUpdated(BillingResult result, @Nullable List<Purchase> purchases) {
        if (result.getResponseCode() == BillingClient.BillingResponseCode.OK && purchases != null) {
            for (Purchase purchase : purchases) {
                if (purchase.getProducts().contains(mProductId)) {
                    finishWith(PaymentResult.paymentSuccess(purchase.getPurchaseToken()));
                    return;
                }
            }
        }
        fail("Purchase flow ended with result: " + result.getResponseCode() + " " + result.getDebugMessage());
    }

    private void fail(String reason) {
        Log.w(TAG, reason);
        finishWith(PaymentResult.failure(reason));
    }

    /** Billing callbacks can arrive on other threads; reply to Chrome once, on the main thread. */
    private void finishWith(PaymentResult result) {
        runOnUiThread(() -> {
            if (mFinished) return;
            mFinished = true;
            Intent intent = new Intent();
            intent.putExtra("methodName", METHOD_NAME);
            intent.putExtra("details", result.getDetails());
            setResult(result.getActivityResult(), intent);
            finish();
        });
    }

    @Override
    protected void onDestroy() {
        if (mBillingClient != null) mBillingClient.endConnection();
        super.onDestroy();
    }
}
