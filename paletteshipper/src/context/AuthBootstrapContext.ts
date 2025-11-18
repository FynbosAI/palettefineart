import { createContext, useContext } from 'react';

const AuthBootstrapContext = createContext<boolean>(false);

export const AuthBootstrapProvider = AuthBootstrapContext.Provider;

export const useAuthBootstrap = () => useContext(AuthBootstrapContext);

export default AuthBootstrapContext;
