FROM fedora:latest
MAINTAINER Chris Kleeschulte <chrisk@bitpay.com>
RUN dnf --assumeyes install \
nodejs \
git \
tar \
zeromq3-devel.x86_64 \
python \
make \
automake \
gcc \
gcc-c++ \
kernel-devel && \
npm install -g mocha && \
adduser bwdb
USER bwdb
RUN  git config --global \
user.name "BitPay Fedora Docker Instance" && \
git config --global \
user.email "support@bitpay.com"
WORKDIR /source/bwdb
