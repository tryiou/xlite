// Copyright (c) 2020 The Blocknet developers
// Distributed under the MIT software license, see the accompanying
// file LICENSE or http://www.opensource.org/licenses/mit-license.php.
import Localize from '../shared/localize';
import IconArrowRight from '../shared/icon-arrow-right';
import { logger } from '../../modules/logger-r';
import Logo from '../shared/logo';
import XliteDaemon from '../../modules/xlite-daemon-r.js';
import { Button } from '../shared/buttons';
import Spinner from '../shared/spinner';

import _ from 'lodash';
import PropTypes from 'prop-types';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { LoginInput } from '../shared/inputs';
import { checkPassword, timeout } from '../../util';
import Alert from '../../modules/alert';
import ContextMenu from '../../modules/context-menu';


const { api } = window;

const LoginPasswordSubmitInput = ({ hidden, setHidden, password, readOnly = false, setPassword, onContextMenu, onSubmit }) => {

  const [focused, setFocused] = useState(false);
  const inputRef = useRef(null);

  const onHideShowClick = () => {
    setHidden(!hidden);
    setTimeout(() => {
      const input = inputRef.current;
      if (input) {
        input.focus();
        const val = input.value;
        input.setSelectionRange(val.length, val.length);
      }
    }, 0);
  };

  const submitHandler = e => {
    e.preventDefault();
    onSubmit();
  };

  return (
    <form className={`lw-login-input-container ${focused ? 'active' : ''}`} onSubmit={submitHandler}>
      <input placeholder={Localize.text('Enter password to unlock', 'login')}
        ref={inputRef}
        id={'js-login-input'}
        className={'lw-login-input'}
        value={password}
        type={hidden ? 'password' : 'text'}
        autoFocus={true}
        required={true}
        spellCheck={false}
        readOnly={readOnly}
        onContextMenu={onContextMenu}
        onChange={e => setPassword(e.target.value)}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)} />
      <button type={'button'} onClick={onHideShowClick}>
        <i className={`far ${hidden ? 'fa-eye' : 'fa-eye-slash'}`}
          title={hidden ? Localize.text('Show password', 'login') : Localize.text('Hide password', 'login')} />
      </button>
      <div className={'lw-login-input-divider'} />
      <button type={'submit'} disabled={readOnly} title={readOnly ? Localize.text('Loading', 'universal') : Localize.text('Submit', 'universal')}>
        {readOnly ?
          <Spinner />
          :
          <IconArrowRight />
        }
      </button>
    </form>
  );
};
LoginPasswordSubmitInput.propTypes = {
  hidden: PropTypes.bool,
  setHidden: PropTypes.func,
  password: PropTypes.string,
  readOnly: PropTypes.bool,
  setPassword: PropTypes.func,
  onSubmit: PropTypes.func,
  onContextMenu: PropTypes.func,
};

const okIconWidth = 20;
const OkIcon = () => <i className={'fas fa-check lw-color-positive-1'} style={{ width: okIconWidth }} />;
const NotOkIcon = () => <i className={'fas fa-times color-negative'} style={{ width: okIconWidth }} />;

const LoginRegister = ({ xliteDaemon, startupInit, setCCWalletStarted }) => {

  const [initialLoadStep1, setInitialLoadStep1] = useState(false);
  const [initialLoadStep2, setInitialLoadStep2] = useState(false);
  const [hidden, setHidden] = useState(true);
  const [password, setPassword] = useState('');
  const [passwordRepeat, setPasswordRepeat] = useState('');
  const [errorMessage, setErrorMessage] = useState('');
  const [processing, setProcessing] = useState(false);
  const [mnemonic, setMnemonic] = useState('');
  const [xliteDaemonWalletCreated, setXliteDaemonWalletCreated] = useState(false);
  const [xliteDaemonIsWalletRPCRunning, setXliteDaemonIsWalletRPCRunning] = useState(false);
  const [xliteDaemonStoredPassword, setXliteDaemonStoredPassword] = useState(false);
  const [createFromMnemonic, setCreateFromMnemonic] = useState(false);
  const [restoreFromMnemonic, setRestoreFromMnemonic] = useState(false);
  const [newMnemonic, setNewMnemonic] = useState('');
  const onLoginSubmitRef = useRef(null);

  const passwordsMatch = password && password === passwordRepeat;
  const [
    totalScore,
    passwordLengthGood,
    passwordContainsLowercase,
    passwordContainsUppercase,
    passwordContainsNumber,
    passwordContainsSpecial,
  ] = checkPassword(password);
  const goodPassword = totalScore >= 9 && passwordsMatch;

  const onLoginSubmit = useCallback(async () => {
    setProcessing(true);

    const storedPassword = await xliteDaemon.getStoredPassword();
    const rpcRunning = await xliteDaemon.isWalletRPCRunning();

    if (!rpcRunning) {
      const started = await xliteDaemon.startSPV(password);
      if (!started) {
        setErrorMessage(storedPassword
          ? Localize.text('Invalid password.', 'login')
          : Localize.text('Failed to start xlite-daemon.', 'login'));
        setProcessing(false);
        return;
      }
    } else if (!storedPassword) {
      setErrorMessage(Localize.text('Invalid password.', 'login'));
      setProcessing(false);
      return;
    } else {
      // Adopted/already-running wallet: the submitted password must still
      // be verified — without this, ANY password "logged in" to an
      // already-unlocked daemon.
      const passwordOk = await xliteDaemon.matchesStoredPassword(password);
      if (!passwordOk) {
        setErrorMessage(Localize.text('Invalid password.', 'login'));
        setProcessing(false);
        return;
      }
    }

    const walletCreated = await xliteDaemon.isWalletCreated();
    const isRpcRunning = await xliteDaemon.isWalletRPCRunning();
    setXliteDaemonWalletCreated(walletCreated);
    setXliteDaemonIsWalletRPCRunning(isRpcRunning);

    await Promise.race([
      startupInit(),
      timeout(2000),
    ]);
    setCCWalletStarted(true);
  }, [xliteDaemon, password, startupInit, setCCWalletStarted]);

  // Keep the ref in sync for async setTimeout calls that need the latest closure
  useEffect(() => {
    onLoginSubmitRef.current = onLoginSubmit;
  }, [onLoginSubmit]);

  // The component requires additional data before rendering
  useEffect(() => {
    if (!xliteDaemon || initialLoadStep1)
      return;
    setInitialLoadStep1(true);
    Promise.all([api.env_shouldAutoLogin(), xliteDaemon.getStoredPassword(), xliteDaemon.isWalletCreated(), xliteDaemon.isWalletRPCRunning()])
      .then(values => {
        const [shouldAutoLogin, storedPw, walletCreated, rpcRunning] = values;
        setXliteDaemonWalletCreated(walletCreated);
        setXliteDaemonIsWalletRPCRunning(rpcRunning);
        setXliteDaemonStoredPassword(!!storedPw);
        setInitialLoadStep2(true); // done loading

        // Auto-login when XLITE_DAEMON_WALLET_PASS and XLITE_DAEMON_WALLET_AUTOLOGIN env vars are set.
        // The raw password never reaches the renderer — main process uses it internally.
        if (shouldAutoLogin) {
          setTimeout(() => { onLoginSubmitRef.current(); }, 250);
        }
      });
  }, [xliteDaemon, initialLoadStep1, onLoginSubmit, setInitialLoadStep1, setInitialLoadStep2]);

  // Do not show login until we have required data
  if (!xliteDaemon || !startupInit || !initialLoadStep2)
    return <div><Spinner /></div>;

  const onRegisterSubmit = async function (e) {
    e.preventDefault();

    const preppedMnemonic = newMnemonic
      .replace(/[\n\r\s]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();

    if (createFromMnemonic && preppedMnemonic.length === 0)
      return Alert.alert(Localize.text('Missing Mnemonic', 'login'), Localize.text('You must enter a valid mnemonic.', 'login'));

    if (restoreFromMnemonic) {
      const { isConfirmed } = await Alert.warning(Localize.text('Are you sure?', 'login'), Localize.text('Importing a new mnemonic will remove the old wallet. Please backup the old wallet before proceeding!', 'login'));
      if (!isConfirmed) {
        setProcessing(false);
        return;
      }
    }

    setProcessing(true);

    let m;
    try {
      m = await xliteDaemon.createSPVWallet(password, preppedMnemonic);
    } catch (err) {
      setErrorMessage(err.message || Localize.text('There was a problem creating the wallet.', 'login'));
      setProcessing(false);
      return;
    }
    if (!m) {
      setErrorMessage(Localize.text('There was a problem creating the wallet.', 'login'));
      setProcessing(false);
      return;
    }

    if (!await xliteDaemon.saveWalletCredentials(password, null)) {
      logger.error('failed to save the wallet credentials');
      setErrorMessage(Localize.text('Oops! There was a problem saving the wallet credentials.', 'login'));
      setProcessing(false);
      return;
    }

    try {
      await xliteDaemon.loadConfs(); // load all confs and update the master conf if necessary
    } catch {
      logger.error('Problem enabling master config.');
      setErrorMessage(Localize.text('Oops! There was a problem enabling the master config.', 'login'));
      setProcessing(false);
      return;
    }

    const started = await xliteDaemon.startSPV(password);
    if (!started) {
      setErrorMessage(Localize.text('Oops! There was a problem starting and unlocking the wallet.', 'login'));
      setProcessing(false);
      return;
    }

    // if(preppedMnemonic) {
    //   const addrSuccess = await xliteDaemon.setAllConfigAddressCounts();
    //   if(!addrSuccess)
    //     logger.error('There was a problem setting all address config counts');
    // }

    setErrorMessage(''); // clear error on success
    const storedPassword = await xliteDaemon.getStoredPassword();
    const walletCreated = await xliteDaemon.isWalletCreated();
    const isRpcRunning = await xliteDaemon.isWalletRPCRunning();

    await Promise.race([
      startupInit(true), // slow load
      timeout(12000),
    ]);

    setXliteDaemonStoredPassword(!!storedPassword && storedPassword !== '');
    setXliteDaemonWalletCreated(walletCreated);
    setXliteDaemonIsWalletRPCRunning(isRpcRunning);
    if (preppedMnemonic) { // If they entered their own mnemonic, just open the application
      setCCWalletStarted(true);
    } else { // If a new mnemonic was generated, show it to them
      setMnemonic(m);
    }
  };

  const onMnemonicContinueClick = e => {
    e.preventDefault();
    setCCWalletStarted(true);
  };

  let textareaNode;

  const onTextareaFocus = () => {
    if (textareaNode) textareaNode.select();
  };

  const toggleCreateFromMnemonic = e => {
    e.preventDefault();
    setCreateFromMnemonic(!createFromMnemonic);
  };

  const toggleRestoreFromMnemonic = e => {
    e.preventDefault();
    if (restoreFromMnemonic) {
      setRestoreFromMnemonic(false);
    } else {
      setRestoreFromMnemonic(true);
    }
  };

  const onMnemonicChange = e => {
    setNewMnemonic(e.target.value);
  };

  const styles = {
    bodyContainer: {
      marginTop: 50
    }
  };

  // Show the login if the wallet was created or if the rpc is running
  // and there's a known xlite-daemon password. Otherwise, show the
  // registration screen.
  const showLogin = !restoreFromMnemonic && xliteDaemon && (xliteDaemonWalletCreated || (xliteDaemonIsWalletRPCRunning && xliteDaemonStoredPassword));
  const showRegistration = !showLogin && xliteDaemon && (restoreFromMnemonic || !xliteDaemonWalletCreated);

  const onMnemonicContextMenu = e => {
    e.preventDefault();
    const menu = new ContextMenu();
    menu.showCopyMenu();
  };
  const onEnterMnemonicContextMenu = e => {
    e.preventDefault();
    const menu = new ContextMenu();
    menu.showStandardMenu();
  };
  const onPasswordContextMenu = e => {
    e.preventDefault();
    const menu = new ContextMenu();
    menu.showPasteMenu();
  };

  return (
    <div className={'lw-login-container'}>
      <div className={'alert lw-beta-warning'}>
        <div className="d-flex align-items-start">
          <i className="fas fa-info-circle alert-icon"></i>
          <div>
            <h4 className="alert-title">XLite Wallet is currently in beta.</h4>
            <p className="alert-content">
              XLite wallet is provided for experimental purposes only and is not intended for public use. The use of XLite for storing digital assets carries inherent risks, and any reliance on it is at your own discretion and risk. XLite is provided 'as is' without any warranties or representations, express or implied. It is your responsibility to ensure compliance with all applicable laws and regulations regarding the use of XLite in your jurisdiction. We disclaim any liability for damages or losses arising from the use or inability to use XLite. By using XLite, you acknowledge and agree to these terms.
            </p>
          </div>
        </div>
      </div>
      <div className={'lw-login-inner-container'}>
        <div className={'lw-login-image-container'}>
          <Logo className={'lw-login-image'} />
        </div>
        {mnemonic &&
          <div style={styles.bodyContainer}>

            <div className={'lw-color-secondary-3'} style={{ marginBottom: 20, fontSize: 14 }}><Localize context={'login'}>Below is the mnemonic seed for your wallet. Please save it securely for your records. If you forget your password or otherwise lose your wallet, you will be able to restore your wallet using these words.</Localize></div>
            <textarea ref={node => node ? textareaNode = node : null} className={'lw-login-textarea text-center text-monospace'} rows={4} value={mnemonic} readOnly={true} onFocus={onTextareaFocus} onContextMenu={onMnemonicContextMenu} />

            <Button
              type={'button'}
              className={'w-100'}
              onClick={onMnemonicContinueClick}
              style={{ marginTop: 25, height: 50 }}><Localize context={'login'}>Continue</Localize></Button>
          </div>
        }
        {showLogin && !mnemonic &&
          <div style={styles.bodyContainer}>
            <LoginPasswordSubmitInput
              hidden={hidden}
              setHidden={setHidden}
              password={password}
              setPassword={setPassword}
              readOnly={processing}
              onContextMenu={onPasswordContextMenu}
              onSubmit={onLoginSubmit} />
            <div className={'lw-login-create-from-mnemonic-button-container'}>
              <a href={'#'} className={'lw-login-create-from-mnemonic-button'}
                onClick={toggleRestoreFromMnemonic}>{Localize.text('Restore wallet from mnemonic', 'login')}</a>
            </div>
          </div>
        }
        {showRegistration && !mnemonic &&
          <div style={styles.bodyContainer}>
            <form onSubmit={onRegisterSubmit}>
              <LoginInput placeholder={Localize.text('Enter password', 'login')}
                autoFocus={true}
                value={password}
                type={'password'}
                hidden={hidden}
                setHidden={setHidden}
                readOnly={processing}
                onContextMenu={onPasswordContextMenu}
                onChange={setPassword} />
              <LoginInput placeholder={Localize.text('Repeat password', 'login')}
                value={passwordRepeat}
                type={'password'}
                hidden={hidden}
                readOnly={processing}
                onContextMenu={onPasswordContextMenu}
                onChange={setPasswordRepeat} />
              {createFromMnemonic || restoreFromMnemonic ?
                <textarea className={'lw-login-textarea'}
                  rows={4} value={newMnemonic} style={{ fontSize: 16 }}
                  placeholder={Localize.text('Enter mnemonic', 'login')}
                  required={true} onChange={onMnemonicChange} onContextMenu={onEnterMnemonicContextMenu} />
                :
                null
              }
              <div className={'lw-login-create-from-mnemonic-button-container'} style={{ marginTop: createFromMnemonic || restoreFromMnemonic ? 0 : -10 }}>
                <a href={'#'} className={'lw-login-create-from-mnemonic-button'}
                  onClick={restoreFromMnemonic ? toggleRestoreFromMnemonic : toggleCreateFromMnemonic}>{restoreFromMnemonic || createFromMnemonic ? Localize.text('Hide mnemonic input', 'login') : Localize.text('Create wallet from mnemonic', 'login')}</a>
              </div>
              <div style={{ marginBottom: 10 }}>
                <div className={'lw-color-secondary-5'} style={{ fontSize: 13 }}>
                  <div>{passwordContainsLowercase ? <OkIcon /> : <NotOkIcon />} {Localize.text('Password must contain a lowercase character.')}</div>
                  <div>{passwordContainsUppercase ? <OkIcon /> : <NotOkIcon />} {Localize.text('Password must contain an uppercase character.')}</div>
                  <div>{passwordContainsNumber ? <OkIcon /> : <NotOkIcon />} {Localize.text('Password must contain a number.')}</div>
                  <div>{passwordContainsSpecial ? <OkIcon /> : <NotOkIcon />} {Localize.text('Password must contain a special character.')}</div>
                  <div>{passwordLengthGood ? <OkIcon /> : <NotOkIcon />} {Localize.text('Password must contain at least 8 characters.')}</div>
                  <div>{passwordsMatch ? <OkIcon /> : <NotOkIcon />} {Localize.text('Passwords must match.')}</div>
                </div>
              </div>

              <Button
                type={'submit'}
                className={'w-100'}
                disabled={!goodPassword || processing}
                style={{ height: 50 }}>{processing ? <Spinner /> : restoreFromMnemonic ? <Localize context={'login'}>Restore Wallet</Localize> : <Localize context={'login'}>Create Wallet</Localize>}</Button>

            </form>
          </div>
        }
        {errorMessage ?
          <div className={'color-negative'} style={{ marginTop: 10, fontSize: 13 }}>
            {errorMessage}</div>
          :
          null
        }
      </div>
    </div>
  );
};
LoginRegister.propTypes = {
  xliteDaemon: PropTypes.instanceOf(XliteDaemon),
  startupInit: PropTypes.func,
  setActiveView: PropTypes.func,
  setCCWalletStarted: PropTypes.func
};

export default LoginRegister;
